"""Shared paths, config and ffmpeg helpers."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

FPS = 25  # LatentSync works at 25 fps; the whole pipeline uses it.
OUT_W, OUT_H = 1080, 1920
SR_MODEL = 16000  # LatentSync + Whisper input rate
SR_OUT = 48000

TOOL_DIR = Path(__file__).resolve().parent.parent


def install_dir() -> Path:
    # LatentSync builds ffmpeg shell commands without quoting, so everything it touches
    # must live in a path without spaces. %LOCALAPPDATA% has none for normal usernames.
    if os.environ.get("AVATAR_HOME"):
        return Path(os.environ["AVATAR_HOME"]).expanduser().resolve()
    if os.name == "nt":
        p = Path(os.environ["LOCALAPPDATA"]) / "AvatarAnselmo"
        return Path("C:/AvatarAnselmo") if " " in str(p) else p
    return Path.home() / ".avatar-anselmo"


def _windows_desktop():
    """The real Desktop (OneDrive backup moves it to e.g. OneDrive\\Ambiente de Trabalho)."""
    import ctypes
    from ctypes import wintypes
    import uuid

    guid = uuid.UUID("{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}")  # FOLDERID_Desktop
    buf = ctypes.c_wchar_p()
    shell32 = ctypes.windll.shell32
    shell32.SHGetKnownFolderPath.argtypes = [ctypes.c_char_p, wintypes.DWORD, wintypes.HANDLE, ctypes.POINTER(ctypes.c_wchar_p)]
    if shell32.SHGetKnownFolderPath(guid.bytes_le, 0, None, ctypes.byref(buf)) != 0:
        return None
    try:
        return Path(buf.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(buf)


def default_output_dir() -> Path:
    desktop = None
    if os.name == "nt":
        try:
            desktop = _windows_desktop()
        except Exception:
            desktop = None
    if not desktop or not desktop.exists():
        desktop = Path.home() / "Desktop"
    if not desktop.exists():
        desktop = Path.home()
    return desktop / "Videos Avatar"


DEFAULTS = {
    "latentsync_dir": "",
    "latentsync_version": "1.6",
    "unet_config": "configs/unet/stage2_512.yaml",
    "checkpoint": "checkpoints/latentsync_unet.pt",
    # Optional lighter model used automatically if the main one runs out of VRAM.
    "fallback_unet_config": "configs/unet/stage2.yaml",
    "fallback_checkpoint": "",
    "inference_steps": 30,
    "fp16": "auto",
    "guidance_scale": 1.5,
    "deepcache": True,
    "seed": 1247,
    "footage_dir": "",
    # Folder of ffmpeg.exe found by the installer (winget only updates PATH for new terminals).
    "ffmpeg_dir": "",
    "output_dir": "",
    # Command that turns text into the cloned voice. Placeholders: {text_file} {out_wav}
    "tts_command": "",
    "whisper_model": "small",
    "caption_font": "Montserrat ExtraBold",
    "caption_uppercase": False,
    "music": "",
    "music_db": -22,
    "zoom_punch_in": 1.12,
}


def config_path() -> Path:
    return install_dir() / "config.json"


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    p = config_path()
    if p.exists():
        cfg.update(json.loads(p.read_text(encoding="utf-8")))
    if not cfg["latentsync_dir"]:
        cfg["latentsync_dir"] = str(install_dir() / "LatentSync")
    if not cfg["output_dir"]:
        cfg["output_dir"] = str(default_output_dir())
    if cfg.get("ffmpeg_dir") and not shutil.which("ffmpeg"):
        # LatentSync also calls ffmpeg through cmd.exe, so fix PATH for this process and its children.
        os.environ["PATH"] = cfg["ffmpeg_dir"] + os.pathsep + os.environ.get("PATH", "")
    return cfg


def save_config(cfg: dict) -> None:
    p = config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    keep = {k: v for k, v in cfg.items() if k in DEFAULTS}
    p.write_text(json.dumps(keep, indent=2, ensure_ascii=False), encoding="utf-8")


def work_root() -> Path:
    return install_dir() / "work"


def setup_console() -> None:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def ffmpeg_bin() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise SystemExit("ffmpeg não encontrado no PATH. Corre o install.bat outra vez.")
    return exe


def ffprobe_bin() -> str:
    exe = shutil.which("ffprobe")
    if not exe:
        raise SystemExit("ffprobe não encontrado no PATH. Corre o install.bat outra vez.")
    return exe


def run(cmd, cwd=None, quiet=True):
    cmd = [str(c) for c in cmd]
    proc = subprocess.run(cmd, cwd=cwd, capture_output=quiet, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = (proc.stderr or "")[-3000:] if quiet else ""
        raise RuntimeError(f"Falhou: {' '.join(cmd[:6])} ...\n{tail}")
    return proc


def ffmpeg(args, cwd=None):
    return run([ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args], cwd=cwd)


def probe(path) -> dict:
    out = run(
        [
            ffprobe_bin(), "-v", "error", "-print_format", "json",
            "-show_streams", "-show_format", str(path),
        ]
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    res = {"has_audio": a is not None, "duration": float(info["format"].get("duration", 0) or 0)}
    if v:
        w, h = int(v["width"]), int(v["height"])
        rot = 0
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(float(sd["rotation"]))
        if "rotate" in (v.get("tags") or {}):
            rot = int(v["tags"]["rotate"])
        if abs(rot) % 180 == 90:  # ffmpeg auto-rotates on decode, so report display size
            w, h = h, w
        num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "25/1").split("/")
        fps = float(num) / float(den) if float(den) else 25.0
        res.update({"width": w, "height": h, "fps": fps})
        if v.get("duration"):
            res["duration"] = float(v["duration"])
    return res


def read_audio(path, sr=SR_MODEL) -> np.ndarray:
    """Decode any audio/video file to mono float32 at `sr`."""
    proc = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(path),
         "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Não consegui ler o áudio {path}: {proc.stderr.decode(errors='replace')[-500:]}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def write_wav(path, samples: np.ndarray, sr: int) -> None:
    import wave

    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def video_files(folder) -> list:
    exts = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
    return sorted(p for p in Path(folder).rglob("*") if p.suffix.lower() in exts and p.is_file())
