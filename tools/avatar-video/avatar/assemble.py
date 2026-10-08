"""Turn planned shots into vertical 1080x1920 base clips cut from the real footage."""

import statistics
from pathlib import Path

from .common import FPS, OUT_H, OUT_W, ffmpeg, probe
from .vision import FaceHandAnalyzer, frame_ok, sample_frames

VERIFY_FPS = 12.5  # every second frame
EXTRA_FRAMES = 4  # LatentSync may emit a frame or two more than the audio; never let it loop the video
FACE_Y = 0.36  # face centre at 36% of the frame height (upper third, room for captions below)
STEP = 0.2


def _subtract(runs, cuts):
    """runs minus the union of cuts, all as [(a, b)]."""
    out = []
    for a, b in runs:
        pieces = [(a, b)]
        for c0, c1 in cuts:
            nxt = []
            for p0, p1 in pieces:
                if c1 <= p0 or c0 >= p1:
                    nxt.append((p0, p1))
                    continue
                if c0 > p0:
                    nxt.append((p0, c0))
                if c1 < p1:
                    nxt.append((c1, p1))
            pieces = nxt
        out += pieces
    return out


def _overlap(used, a, b):
    return sum(max(0.0, min(b, u1) - max(a, u0)) for u0, u1 in used)


class FootagePool:
    """Hands out ranges of good footage: fresh material first, then least-repeated, then ping-pong."""

    def __init__(self, segments, only=None, exclude=()):
        segs = [dict(s) for s in segments]
        if only:
            segs = [s for s in segs if s["id"] in only]
        else:
            segs = [s for s in segs if not s.get("other_person")]
        segs = [s for s in segs if s["id"] not in set(exclude)]
        if not segs:
            raise SystemExit("Não há segmentos de vídeo disponíveis (verifica --only/--exclude).")
        for s in segs:
            s["bad"] = []  # [(t0, t1)] found by dense verification or lip-sync failures
            s["used"] = []  # [(t0, t1)] already placed in this video
        self.segs = segs
        self.by_id = {s["id"]: s for s in segs}
        self.last_id = None
        self.recent = []  # [(segment id, t0, t1)] of the last placed shots

    def _near(self, s, a, b):
        """Overlap with the two previous shots: repeating those gestures right after a cut is obvious."""
        return sum(_overlap([(r0, r1)], a, b) for sid, r0, r1 in self.recent[-2:] if sid == s["id"])

    def clean_seconds(self):
        return sum(b - a for s in self.segs for a, b in self._free_runs(s))

    def _free_runs(self, s):
        """Usable ranges of a segment after removing bad spots."""
        return [(a, b) for a, b in _subtract([(s["start"], s["end"])], s["bad"]) if b - a > 0.05]

    def take(self, dur, force_pingpong=False):
        """Propose (segment, start, available_seconds, pingpong). Nothing is recorded until commit()."""
        order = sorted(self.segs, key=lambda s: (s["id"] == self.last_id, -s["score"]))
        if not force_pingpong:
            # 1) footage never shown yet
            for s in order:
                for a, b in _subtract(self._free_runs(s), s["used"]):
                    if b - a >= dur:
                        return s, a, b - a, False
            # 2) reuse footage, starting where it overlaps least with what was already shown
            best = None
            for s in order:
                for a, b in self._free_runs(s):
                    c = a
                    while c + dur <= b + 1e-6:
                        key = (self._near(s, c, c + dur) > 0.05, s["id"] == self.last_id,
                               round(_overlap(s["used"], c, c + dur), 1), -s["score"])
                        if best is None or key < best[0]:
                            best = (key, s, c, b)
                        c += STEP
            if best:
                _, s, c, b = best
                return s, c, b - c, False
        # 3) nothing long enough: forward + reverse of a clean run, rotating between runs
        runs = [(s, a, b) for s in order for a, b in self._free_runs(s) if b - a >= 1.0]
        if not runs:
            raise SystemExit("Acabou o vídeo limpo: todos os trechos têm a cara tapada ou mal visível.")
        s, a, b = min(runs, key=lambda r: (self._near(r[0], r[1], r[2]) > 0.05, r[0]["id"] == self.last_id,
                                           round(_overlap(r[0]["used"], r[1], r[2]), 1), -(r[2] - r[1])))
        return s, a, b - a, True

    def commit(self, s, start, dur):
        s["used"].append((start, start + dur))
        self.recent.append((s["id"], start, start + dur))
        self.last_id = s["id"]

    def mark_bad(self, s, t0, t1=None):
        s["bad"].append((t0 - 0.4, (t1 if t1 is not None else t0) + 0.4))


def _crop_for(w, h, cx, cy, zoom, content=(0.0, 1.0)):
    """Crop rectangle (in source pixels) giving a 9:16 frame with the face in the upper third.

    content: horizontal span of real picture (a vertical clip inside a blurred 16:9 fill); the crop never
    shows the blur, zooming in a little if the clip is narrower than the 9:16 window.
    """
    cx0, cx1 = content[0] * w, content[1] * w
    ch = h / zoom
    cw = ch * 9 / 16
    if cw > cx1 - cx0:
        cw = (cx1 - cx0) / (1.0 if zoom <= 1.0 else zoom)
        ch = cw * 16 / 9
    cw, ch = int(cw) // 2 * 2, int(min(ch, h)) // 2 * 2
    x = min(max(cx * w - cw / 2, cx0), cx1 - cw)
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
    # trim before reverse: reverse buffers its whole input, so it must only ever see this piece.
    # No sharpening here: finish.py sharpens after lip-sync, so the regenerated mouth matches the rest.
    vf = f"fps={FPS},trim=end_frame={frames},crop={cw}:{ch}:{x}:{y},scale={OUT_W}:{OUT_H}:flags=lanczos,setsar=1"
    if reverse:
        vf += ",reverse"
    ffmpeg(
        ["-ss", f"{start:.3f}", "-t", f"{frames / FPS + 0.3:.3f}", "-i", str(video), "-an", "-vf", vf,
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
        pool.commit(s, start, span)
        info = probe(s["video"])
        cx = statistics.median(f["cx"] for f in faces)
        cy = statistics.median(f["cy"] for f in faces)
        fh = statistics.median(f["fh"] for f in faces)
        crop = _crop_for(info["width"], info["height"], cx, cy, zoom,
                         (s.get("content_x0", 0.0), s.get("content_x1", 1.0)))
        # Top of the head (incl. hair, ~half a face above the face box) in output pixels, for the top texts.
        head_top = ((cy - fh) * info["height"] - crop[3]) * OUT_H / crop[1]
        out = work / f"shot_{shot['k']:02d}_base.mp4"
        if not pingpong or span >= dur:
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
        shot.update({"base": str(out), "segment": s["id"], "src_start": round(start, 3), "src_dur": round(span, 3),
                     "src_range": (start, start + span), "zoom": zoom, "crop": crop, "head_top": round(head_top)})
        return shot
    raise SystemExit(f"Não encontrei vídeo limpo suficiente para o plano {shot['k']} ({dur:.1f}s).")


def make_pool(footage, only=None, exclude=(), all_videos=False):
    segs = footage["segments"]
    if not all_videos and not only:
        segs = [s for s in segs if s["video"] == footage["chosen_video"]]
    return FootagePool(segs, only=only, exclude=exclude)


def build_all(shots, pool, work: Path, zoom_punch_in=1.12, log=print):
    need = sum(s["frames"] for s in shots) / FPS
    have = pool.clean_seconds()
    if have < 1.3 * need:
        log(f"   AVISO: só {have:.0f}s de vídeo limpo para {need:.0f}s de fala; vão repetir-se gestos. "
            "Junta mais vídeos teus à pasta ou usa --all-videos.")
    analyzer = FaceHandAnalyzer(video_mode=False)
    try:
        for shot in shots:
            zoom = zoom_punch_in if shot["k"] % 2 == 1 else 1.0
            build_shot(shot, pool, analyzer, work, zoom, log)
            log(f"   plano {shot['k'] + 1}/{len(shots)}: {shot['frames'] / FPS:.1f}s de {shot['segment']} @ {shot['src_start']:.1f}s")
    finally:
        analyzer.close()
    return shots


def rebuild_shot(shot, pool, work, log=print):
    """Re-cut a shot from other footage after LatentSync could not find the face in it."""
    s = pool.by_id.get(shot["segment"])
    if s is not None:
        # The failing range is unusable: drop it from 'used' and mark it bad for good.
        rng = tuple(shot["src_range"])
        if rng in s["used"]:
            s["used"].remove(rng)
        pool.mark_bad(s, rng[0], rng[1])
    analyzer = FaceHandAnalyzer(video_mode=False)
    try:
        return build_shot(shot, pool, analyzer, work, shot.get("zoom", 1.0), log)
    finally:
        analyzer.close()
