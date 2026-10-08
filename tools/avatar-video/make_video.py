"""Avatar video maker: script -> cloned voice -> lip-synced vertical video ready for Reels/Shorts.

  avatar doctor [--test]                 check GPU/models (and time a 3 s lip-sync)
  avatar select --footage "<folder>"     find the best clean talking segments in your videos
  avatar video --script roteiro.json     make the video (uses tts_command for the voice)
  avatar video --script roteiro.txt --audio voz.wav
  avatar config tts_command="..."        change a setting
"""

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from avatar.common import FPS, load_config, save_config, setup_console, work_root  # noqa: E402


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()[:50] or "video"


def load_script(path):
    p = Path(path)
    if p.suffix.lower() == ".json":
        d = json.loads(p.read_text(encoding="utf-8"))
        if "final" in d:
            d = d["final"]
        return d
    return {"script": p.read_text(encoding="utf-8").strip()}


def tts(cfg, text, out_wav, work):
    cmd = cfg.get("tts_command")
    if not cmd:
        raise SystemExit(
            "Não há comando de voz configurado (tts_command). Passa --audio voz.wav "
            "ou configura: avatar config tts_command=\"...{text_file}...{out_wav}...\""
        )
    import subprocess

    txt = work / "texto.txt"
    txt.write_text(text, encoding="utf-8")
    full = cmd.replace("{text_file}", f'"{txt}"').replace("{out_wav}", f'"{out_wav}"')
    print(f"A gerar a voz: {full}")
    subprocess.run(full, shell=True, check=True)
    if not Path(out_wav).exists():
        raise SystemExit("O comando de voz terminou mas não criou o ficheiro de áudio.")


def _ids(arg, footage):
    if not arg:
        return None
    ids = {x.strip() for x in arg.split(",") if x.strip()}
    known = {s["id"] for s in footage["segments"]}
    unknown = sorted(ids - known)
    if unknown:
        raise SystemExit(f"Segmentos desconhecidos: {', '.join(unknown)} (vê footage_preview.jpg)")
    return ids


def _existing(path, what):
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise SystemExit(f"{what} não encontrado: {p}")
    return p


def cmd_video(args, cfg):
    from avatar import assemble, audio_plan, captions, finish, lipsync

    # Validate everything up front: lip-sync takes long, nothing should fail after it.
    script_path = _existing(args.script, "Guião")
    data = load_script(script_path)
    text = data["script"].strip()
    if not text:
        raise SystemExit("O guião está vazio.")
    audio = _existing(args.audio, "Áudio") if args.audio else None
    music = args.music or cfg.get("music") or None
    music = _existing(music, "Música") if music else None
    # The work dir name must be a slug: LatentSync runs ffmpeg through the shell without quoting paths.
    name = slug(args.name or data.get("title_shorts") or script_path.stem)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    work = work_root() / f"{name}_{stamp}"
    work.mkdir(parents=True, exist_ok=True)
    print(f"Pasta de trabalho: {work}")
    t_start = time.time()

    footage_json = Path(args.footage_json) if args.footage_json else work_root() / "footage.json"
    if not footage_json.exists():
        raise SystemExit("Ainda não escolhi os teus vídeos. Corre primeiro: avatar select --footage \"<pasta>\"")
    footage = json.loads(footage_json.read_text(encoding="utf-8"))
    if args.video:
        match = [v["path"] for v in footage["videos"] if Path(v["path"]).name == args.video or v["path"] == args.video]
        if not match:
            raise SystemExit(f"--video {args.video}: não está na lista do último 'select'.")
        footage["chosen_video"] = match[0]
    only, exclude = _ids(args.only, footage), _ids(args.exclude, footage) or ()
    pool = assemble.make_pool(footage, only=only, exclude=exclude, all_videos=args.all_videos)

    # 1. voice
    voice_src = audio or work / "voz_tts.wav"
    if not audio:
        tts(cfg, text, voice_src, work)
    print("1/5 Voz: a normalizar e a planear os cortes ...")
    wav48, wav16, n_frames = audio_plan.prepare_voice(voice_src, work)
    shots = audio_plan.plan_shots(wav16, n_frames)
    audio_plan.slice_audio(wav16, shots, work)
    print(f"    {n_frames / FPS:.1f}s de fala, {len(shots)} planos")

    # 2. base footage
    print("2/5 A cortar os teus vídeos para vertical ...")
    assemble.build_all(shots, pool, work, zoom_punch_in=float(cfg["zoom_punch_in"]))

    # 3. lip-sync
    print(f"3/5 Sincronização labial ({args.lipsync}) ...")
    runner = lipsync.LatentSyncRunner(cfg) if args.lipsync == "latentsync" else None
    try:
        first_model = runner.loaded if runner else None
        i = 0
        while i < len(shots):
            s = shots[i]
            out = work / f"shot_{s['k']:02d}_sync.mp4"
            for attempt in range(3):
                try:
                    dt = runner.run(s["base"], s["audio"], out) if runner else lipsync.passthrough(s["base"], out)
                    break
                except lipsync.FaceNotFound:
                    print(f"    plano {s['k'] + 1}: o modelo não encontrou a cara num frame; a trocar de trecho ...")
                    assemble.rebuild_shot(s, pool, work, shots)
            else:
                raise SystemExit(f"O plano {s['k'] + 1} falhou 3 vezes. Exclui o segmento {s['segment']} e tenta outra vez.")
            s["synced"] = str(out)
            print(f"    plano {i + 1}/{len(shots)} pronto ({dt:.0f}s)")
            if runner and runner.loaded != first_model:
                # Switched to the lighter model mid-video: redo earlier shots so every mouth matches,
                # and remember the switch so the next video does not hit the same out-of-memory.
                cfg["unet_config"], cfg["checkpoint"] = runner.loaded
                save_config(cfg)
                first_model = runner.loaded
                if i > 0:
                    print("    a refazer os planos anteriores com o mesmo modelo ...")
                    i = 0
                    continue
            i += 1
    finally:
        if runner:
            runner.close()

    # 4. captions
    print("4/5 Legendas ...")
    timed = captions.align(text, wav16, cfg["whisper_model"])
    hook = None if args.no_hook else (args.hook or data.get("hook_on_screen"))
    popups = [] if args.no_captions else captions.popup_times(timed, data.get("on_screen_texts", []))
    ass = captions.build_ass(
        [] if args.no_captions else timed, work / "captions.ass", font=cfg["caption_font"],
        uppercase=bool(cfg["caption_uppercase"]), hook=hook, popups=popups, shots=shots,
    )
    (work / "word_times.json").write_text(json.dumps(timed, ensure_ascii=False, indent=1), encoding="utf-8")

    # 5. final
    print("5/5 A exportar o vídeo final ...")
    out_dir = Path(cfg["output_dir"])
    out_mp4 = out_dir / f"{name}.mp4"
    if out_mp4.exists():
        out_mp4 = out_dir / f"{name}_{stamp}.mp4"
    finish.finish(shots, wav48, ass, out_mp4, work, n_frames, music=music, music_db=float(cfg["music_db"]))
    if data.get("caption_instagram") or data.get("hashtags"):
        post = out_mp4.with_suffix(".txt")
        post.write_text(
            (f"TÍTULO (Shorts): {data.get('title_shorts', '')}\n\n" if data.get("title_shorts") else "")
            + f"{data.get('caption_instagram', '')}\n\n{' '.join(data.get('hashtags', []))}\n",
            encoding="utf-8",
        )
    (work / "shots.json").write_text(json.dumps(shots, ensure_ascii=False, indent=1), encoding="utf-8")
    if not args.keep_work:
        for f in work.glob("shot_*_p*.mp4"):
            f.unlink()
    print(f"\nPronto em {(time.time() - t_start) / 60:.1f} min: {out_mp4}")
    print("Ao publicar, marca a opção de conteúdo feito com IA (Instagram e YouTube pedem isso).")


def main():
    setup_console()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("doctor")
    d.add_argument("--test", action="store_true", help="also lip-sync 3 s to measure speed")

    s = sub.add_parser("select")
    s.add_argument("--footage", help="folder with your talking videos")

    v = sub.add_parser("video")
    v.add_argument("--script", required=True, help=".txt (spoken text) or .json (script + hook + caption)")
    v.add_argument("--audio", help="ready voice file; if missing, tts_command generates it")
    v.add_argument("--name")
    v.add_argument("--hook", help="big text on screen in the first seconds")
    v.add_argument("--no-hook", action="store_true")
    v.add_argument("--no-captions", action="store_true")
    v.add_argument("--music", help="background music file (ducked under the voice)")
    v.add_argument("--lipsync", choices=["latentsync", "none"], default="latentsync")
    v.add_argument("--video", help="use this source video instead of the auto-chosen one")
    v.add_argument("--all-videos", action="store_true", help="mix segments from different source videos")
    v.add_argument("--only", help="comma-separated segment ids to use (e.g. V1-S3,V1-S7)")
    v.add_argument("--exclude", help="comma-separated segment ids to avoid")
    v.add_argument("--footage-json")
    v.add_argument("--keep-work", action="store_true")

    c = sub.add_parser("config")
    c.add_argument("pairs", nargs="*", help="key=value")

    args = ap.parse_args()
    cfg = load_config()
    if args.cmd == "doctor":
        from avatar import doctor

        sys.exit(1 if doctor.run(test=args.test) else 0)
    elif args.cmd == "select":
        from avatar.select_footage import select

        folder = args.footage or cfg.get("footage_dir")
        if not folder:
            raise SystemExit("Indica a pasta: avatar select --footage \"C:\\...\\a pasta dos vídeos\"")
        folder = Path(folder).expanduser().resolve()
        if not folder.is_dir():
            raise SystemExit(f"Pasta não encontrada: {folder}")
        cfg["footage_dir"] = str(folder)
        save_config(cfg)
        select(folder, work_root())
    elif args.cmd == "video":
        cmd_video(args, cfg)
    elif args.cmd == "config":
        if not args.pairs:
            print(json.dumps(cfg, indent=2, ensure_ascii=False))
            return
        for pair in args.pairs:
            k, _, val = pair.partition("=")
            if k not in cfg:
                raise SystemExit(f"Chave desconhecida: {k}")
            cur = cfg[k]
            if isinstance(cur, bool):
                val = val.lower() in ("1", "true", "sim", "yes")
            elif isinstance(cur, (int, float)):
                try:
                    num = float(val)
                except ValueError:
                    raise SystemExit(f"{k} precisa de um número (recebi {val!r})")
                val = int(num) if isinstance(cur, int) and num.is_integer() else num
            cfg[k] = val
        save_config(cfg)
        print("Guardado.")


if __name__ == "__main__":
    main()
