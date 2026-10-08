"""Scan a folder of talking videos and find the best continuous segments to use as lip-sync base."""

import json
import statistics
from pathlib import Path

import cv2
import numpy as np

from .common import ffmpeg, probe, video_files
from .vision import FaceHandAnalyzer, detect_cuts, frame_ok, is_cut, sample_frames

SAMPLE_FPS = 5
MIN_SEG = 2.0


def _segments_for_video(path, analyzer, log):
    info = probe(path)
    step = 1.0 / SAMPLE_FPS
    cuts = detect_cuts(path)
    samples = []
    prev_a = None
    for t, rgb in sample_frames(path, SAMPLE_FPS):
        a = analyzer.analyze(rgb)
        a["t"] = t
        prev_t = prev_a["t"] if prev_a else -1.0
        a["cut_before"] = any(prev_t < c <= t + 0.02 for c in cuts) or is_cut(prev_a, a)
        samples.append(a)
        prev_a = a
    if not samples:
        return info, [], []

    sharp_vals = [s["sharp"] for s in samples if s.get("n_faces") == 1]
    sharp_ref = statistics.median(sharp_vals) if sharp_vals else 1.0

    runs, cur = [], []
    for s in samples:
        good = frame_ok(s) and s["sharp"] >= 0.45 * sharp_ref
        if s["cut_before"] and cur:
            runs.append(cur)
            cur = []
        if good:
            cur.append(s)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)

    segs = []
    for run in runs:
        # Stay one sample away from the bad/cut sample on each side: the problem may start between samples.
        start, end = run[0]["t"], run[-1]["t"]
        if run[0] is not samples[0]:
            start += step
        if end - start < MIN_SEG:
            continue
        cxs = [s["cx"] for s in run]
        fhs = [s["fh"] for s in run]
        seg = {
            "video": str(path),
            "start": round(start, 3),
            "end": round(end, 3),
            "dur": round(end - start, 3),
            "cx": statistics.median(cxs),
            "cy": statistics.median(s["cy"] for s in run),
            "fw": statistics.median(s["fw"] for s in run),
            "fh": statistics.median(fhs),
            "yaw": statistics.mean(s["yaw"] for s in run),
            "sharp_rel": statistics.median(s["sharp"] for s in run) / (sharp_ref or 1.0),
            "hands_near": sum(s["hand_near_face"] for s in run) / len(run),
            "jitter": float(np.std(cxs)),
        }
        segs.append(seg)

    res_factor = min(1.0, min(info["width"], info["height"]) / 1080)
    for s in segs:
        # Face height that will fill the vertical frame well after cropping.
        face_score = min(1.0, s["fh"] / 0.30)
        s["score"] = round(
            0.25 * min(s["dur"], 10) / 10
            + 0.20 * min(s["sharp_rel"], 1.5) / 1.5
            + 0.15 * face_score
            + 0.15 * max(0.0, 1 - s["yaw"] / 0.32)
            + 0.10 * max(0.0, 1 - s["jitter"] / 0.04)
            + 0.10 * (1 - s["hands_near"])
            + 0.05 * res_factor,
            4,
        )
    return info, segs, samples


def _thumb(video, t, out_png):
    ffmpeg(["-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", "-vf", "scale=-2:360", str(out_png)])


def _contact_sheet(segs, work, out_jpg, max_items=24):
    tiles = []
    for i, s in enumerate(segs[:max_items]):
        png = work / f"_thumb_{i}.png"
        _thumb(s["video"], (s["start"] + s["end"]) / 2, png)
        img = cv2.imread(str(png))
        png.unlink(missing_ok=True)
        if img is None:
            continue
        img = cv2.resize(img, (int(img.shape[1] * 300 / img.shape[0]), 300))
        label = f"{s['id']}  {s['dur']:.0f}s  q{s['score']:.2f}"
        cv2.rectangle(img, (0, 0), (img.shape[1], 34), (0, 0, 0), -1)
        cv2.putText(img, label, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)
        tiles.append(img)
    if not tiles:
        return None
    tw = max(t.shape[1] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 4, 4, 4, 4 + tw - t.shape[1], cv2.BORDER_CONSTANT, value=(40, 40, 40)) for t in tiles]
    cols = 4
    rows = [tiles[i : i + cols] for i in range(0, len(tiles), cols)]
    blank = np.full_like(tiles[0], 40)
    rows = [np.hstack(r + [blank] * (cols - len(r))) for r in rows]
    cv2.imwrite(str(out_jpg), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return out_jpg


def select(footage_dir, work: Path, log=print) -> dict:
    footage_dir = Path(footage_dir).expanduser().resolve()
    work.mkdir(parents=True, exist_ok=True)
    vids = video_files(footage_dir)
    if not vids:
        raise SystemExit(f"Nenhum vídeo encontrado em {footage_dir}")
    analyzer = FaceHandAnalyzer(video_mode=True)
    videos, all_segs = [], []
    for vi, v in enumerate(vids, 1):
        log(f"[{vi}/{len(vids)}] a analisar {v.name} ...")
        try:
            info, segs, _ = _segments_for_video(v, analyzer, log)
        except Exception as e:  # a broken file must not stop the scan
            log(f"   ignorado: {e}")
            continue
        for si, s in enumerate(segs, 1):
            s["id"] = f"V{vi}-S{si}"
        good = sum(s["dur"] for s in segs)
        quality = sum(s["dur"] * s["score"] for s in segs)
        videos.append({"index": vi, "path": str(v), **info, "good_seconds": round(good, 1), "quality": round(quality, 2)})
        all_segs += segs
        log(f"   {len(segs)} segmentos bons, {good:.0f}s utilizáveis")
    analyzer.close()
    if not all_segs:
        raise SystemExit("Não encontrei nenhum trecho com a cara bem visível e sem mãos à frente da boca.")
    videos.sort(key=lambda x: x["quality"], reverse=True)
    best = videos[0]["path"]
    all_segs.sort(key=lambda s: s["score"], reverse=True)
    result = {
        "footage_dir": str(footage_dir),
        "chosen_video": best,
        "videos": videos,
        "segments": all_segs,
    }
    (work / "footage.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    chosen_segs = [s for s in all_segs if s["video"] == best]
    sheet = _contact_sheet(chosen_segs, work, work / "footage_preview.jpg")
    _contact_sheet(all_segs, work, work / "footage_preview_all.jpg")
    log(f"Melhor vídeo: {Path(best).name} ({videos[0]['good_seconds']}s bons)")
    if sheet:
        log(f"Pré-visualização: {sheet}")
    return result
