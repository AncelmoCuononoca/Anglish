"""Turn planned shots into vertical 1080x1920 base clips cut from the real footage."""

import statistics
from pathlib import Path

from .common import FPS, OUT_H, OUT_W, ffmpeg, probe
from .vision import FaceHandAnalyzer, frame_ok, sample_frames

VERIFY_FPS = 12.5  # every second frame
EXTRA_FRAMES = 4  # LatentSync may emit a frame or two more than the audio; never let it loop the video
FACE_Y = 0.36  # face centre at 36% of the frame height (upper third, room for captions below)


class FootagePool:
    """Hands out unused ranges of good footage, preferring fresh material over reuse."""

    def __init__(self, segments, only=None, exclude=()):
        segs = [dict(s) for s in segments]
        if only:
            segs = [s for s in segs if s["id"] in only]
        segs = [s for s in segs if s["id"] not in set(exclude)]
        if not segs:
            raise SystemExit("Não há segmentos de vídeo disponíveis (verifica --only/--exclude).")
        for s in segs:
            s["cursor"] = s["start"]
            s["bad"] = []  # [(t0, t1)] found by dense verification
            s["used"] = []  # [(t0, t1)] already placed in this video
        self.segs = segs
        self.last_id = None

    def _free_runs(self, s):
        """Usable [a, b) ranges of a segment after removing bad spots."""
        runs, a = [], s["start"]
        for b0, b1 in sorted(s["bad"]):
            if b0 > a:
                runs.append((a, b0))
            a = max(a, b1)
        if s["end"] > a:
            runs.append((a, s["end"]))
        return runs

    def take(self, dur, force_pingpong=False):
        """Return (segment, start, available_seconds, pingpong)."""
        order = sorted(self.segs, key=lambda s: (s["id"] == self.last_id, -s["score"]))
        if not force_pingpong:
            # 1) unused footage long enough
            for s in order:
                for a, b in self._free_runs(s):
                    a = max(a, s["cursor"])
                    if b - a >= dur:
                        s["cursor"] = a + dur
                        s["used"].append((a, a + dur))
                        self.last_id = s["id"]
                        return s, a, b - a, False
            # 2) reuse footage already shown, starting where it overlaps least with what was shown
            best = None
            for s in order:
                for a, b in self._free_runs(s):
                    c = a
                    while c + dur <= b + 1e-6:
                        ov = sum(max(0.0, min(c + dur, u1) - max(c, u0)) for u0, u1 in s["used"])
                        key = (s["id"] == self.last_id, round(ov, 1), -s["score"])
                        if best is None or key < best[0]:
                            best = (key, s, c, b)
                        c += 0.2
            if best:
                _, s, c, b = best
                s["used"].append((c, c + dur))
                self.last_id = s["id"]
                return s, c, b - c, False
        # 3) nothing long enough: forward + reverse of the longest clean run
        runs = [(s, a, b) for s in order for a, b in self._free_runs(s) if b - a >= 1.0]
        if not runs:
            raise SystemExit("Acabou o vídeo limpo: todos os trechos têm a cara tapada ou mal visível.")
        s, a, b = max(runs, key=lambda r: r[2] - r[1])
        self.last_id = s["id"]
        return s, a, b - a, True

    def mark_bad(self, s, t):
        s["bad"].append((t - 0.4, t + 0.4))


def _crop_for(w, h, cx, cy, zoom):
    """Crop rectangle (in source pixels) giving a 9:16 frame with the face in the upper third."""
    ch = h / zoom
    cw = ch * 9 / 16
    if cw > w:
        cw = w / zoom
        ch = cw * 16 / 9
    cw, ch = int(cw) // 2 * 2, int(ch) // 2 * 2
    x = min(max(cx * w - cw / 2, 0), w - cw)
    y = min(max(cy * h - FACE_Y * ch, 0), h - ch)
    return cw, ch, int(x) // 2 * 2, int(y) // 2 * 2


def _verify(analyzer, video, start, dur):
    """Check every second frame. Returns (ok, bad_time, faces)."""
    faces = []
    for t, rgb in sample_frames(video, VERIFY_FPS, start=start, duration=dur):
        a = analyzer.analyze(rgb)
        if not frame_ok(a, strict=False):
            return False, t, faces
        faces.append(a)
    if len(faces) < max(2, int(dur * VERIFY_FPS) - 2):
        return False, start + dur, faces
    return True, None, faces


def _render_piece(video, start, frames, crop, out, reverse=False):
    cw, ch, x, y = crop
    scale = OUT_H / ch
    vf = f"fps={FPS},crop={cw}:{ch}:{x}:{y},scale={OUT_W}:{OUT_H}:flags=lanczos"
    if scale > 1.25:
        vf += ",unsharp=5:5:0.5:5:5:0.0"
    vf += ",setsar=1"
    if reverse:
        vf += ",reverse"
    ffmpeg(
        ["-ss", f"{start:.3f}", "-i", str(video), "-t", f"{frames / FPS + 0.5:.3f}", "-an", "-vf", vf,
         "-frames:v", str(frames), "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", str(out)]
    )


def build_shot(shot, pool, analyzer, work: Path, zoom, log):
    need = shot["frames"] + EXTRA_FRAMES
    dur = need / FPS
    for attempt in range(30):
        s, start, avail, pingpong = pool.take(dur, force_pingpong=attempt >= 20)
        span = min(dur, avail) if pingpong else dur
        ok, bad_t, faces = _verify(analyzer, s["video"], start, span)
        if not ok:
            pool.mark_bad(s, bad_t)
            continue
        info = probe(s["video"])
        cx = statistics.median(f["cx"] for f in faces)
        cy = statistics.median(f["cy"] for f in faces)
        crop = _crop_for(info["width"], info["height"], cx, cy, zoom)
        out = work / f"shot_{shot['k']:02d}_base.mp4"
        if not pingpong:
            _render_piece(s["video"], start, need, crop, out)
        else:
            fwd = int(span * FPS)
            pieces, left, rev = [], need, False
            while left > 0:
                n = min(fwd, left)
                p = work / f"shot_{shot['k']:02d}_p{len(pieces)}.mp4"
                # reversed pieces must start from the end of the forward piece
                _render_piece(s["video"], start + (fwd - n) / FPS if rev else start, n, crop, p, reverse=rev)
                pieces.append(p)
                left -= n
                rev = not rev
            lst = work / f"shot_{shot['k']:02d}_list.txt"
            lst.write_text("".join(f"file '{p.name}'\n" for p in pieces), encoding="utf-8")
            ffmpeg(["-f", "concat", "-safe", "0", "-i", lst.name, "-c", "copy", out.name], cwd=work)
            log(f"   plano {shot['k']}: pouco vídeo limpo, usei ida-e-volta ({s['id']})")
        shot.update({"base": str(out), "segment": s["id"], "src_start": round(start, 3), "zoom": zoom, "crop": crop})
        return shot
    raise SystemExit(f"Não encontrei vídeo limpo suficiente para o plano {shot['k']} ({dur:.1f}s).")


def build_all(shots, footage, work: Path, zoom_punch_in=1.12, only=None, exclude=(), all_videos=False, log=print):
    segs = footage["segments"]
    if not all_videos and not only:
        segs = [s for s in segs if s["video"] == footage["chosen_video"]]
    pool = FootagePool(segs, only=only, exclude=exclude)
    analyzer = FaceHandAnalyzer(video_mode=False)
    try:
        for shot in shots:
            zoom = zoom_punch_in if shot["k"] % 2 == 1 else 1.0
            build_shot(shot, pool, analyzer, work, zoom, log)
            log(f"   plano {shot['k'] + 1}/{len(shots)}: {shot['frames'] / FPS:.1f}s de {shot['segment']} @ {shot['src_start']:.1f}s")
    finally:
        analyzer.close()
    return shots


def rebuild_shot(shot, footage, work, exclude_ranges, log=print):
    """Re-cut a shot from different footage after LatentSync failed on it."""
    segs = [s for s in footage["segments"] if s["video"] == footage["chosen_video"]] or footage["segments"]
    pool = FootagePool(segs)
    for s in pool.segs:
        for seg_id, t in exclude_ranges:
            if s["id"] == seg_id:
                s["bad"].append((t - 0.1, t + shot["frames"] / FPS + 0.5))
    analyzer = FaceHandAnalyzer(video_mode=False)
    try:
        return build_shot(shot, pool, analyzer, work, shot.get("zoom", 1.0), log)
    finally:
        analyzer.close()
