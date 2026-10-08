"""Frame sampling and per-frame face/hand analysis (MediaPipe, CPU)."""

import math
import subprocess

import cv2
import numpy as np

from .common import ffmpeg_bin, probe

ANALYSIS_W = 640


def sample_frames(path, fps, start=None, duration=None, width=ANALYSIS_W):
    """Yield (t, rgb_frame) decoded by ffmpeg at a fixed rate.

    ffmpeg (not OpenCV) decodes so rotation and seeking match what assemble.py renders later.
    """
    info = probe(path)
    w, h = info["width"], info["height"]
    out_w = width
    out_h = int(round(h * out_w / w / 2)) * 2
    cmd = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", str(path)]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += ["-an", "-vf", f"fps={fps},scale={out_w}:{out_h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    frame_bytes = out_w * out_h * 3
    i = 0
    t0 = start or 0.0
    try:
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            yield t0 + i / fps, np.frombuffer(buf, np.uint8).reshape(out_h, out_w, 3)
            i += 1
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


class FaceHandAnalyzer:
    """Answers: exactly one usable face? where? frontal? hand over the mouth? sharp?"""

    def __init__(self, video_mode=True):
        import mediapipe as mp

        self._fd = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6)
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=not video_mode,
            max_num_hands=2,
            model_complexity=0,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def close(self):
        self._fd.close()
        self._hands.close()

    def analyze(self, rgb) -> dict:
        h, w, _ = rgb.shape
        det = self._fd.process(rgb)
        faces = []
        for d in det.detections or []:
            bb = d.location_data.relative_bounding_box
            kps = [(k.x, k.y) for k in d.location_data.relative_keypoints]
            faces.append({"score": d.score[0], "x": bb.xmin, "y": bb.ymin, "w": bb.width, "h": bb.height, "kps": kps})
        # Faces too small to matter (people in the background, posters) do not count.
        faces = [f for f in faces if f["h"] * h >= 40]
        res = {"n_faces": len(faces)}
        if len(faces) != 1:
            return res
        f = faces[0]
        (rex, rey), (lex, ley), (nx, ny), (mx, my), _, _ = f["kps"]
        eye_dist = math.hypot((lex - rex) * w, (ley - rey) * h) + 1e-6
        eye_mid_x = (rex + lex) / 2
        res.update(
            {
                "score": float(f["score"]),
                "cx": f["x"] + f["w"] / 2,
                "cy": f["y"] + f["h"] / 2,
                "fw": f["w"],
                "fh": f["h"],
                # 0 = looking straight at the camera; ~0.5 = strong profile
                "yaw": float(abs(nx - eye_mid_x) * w / eye_dist),
                "roll": float(math.degrees(math.atan2((ley - rey) * h, (lex - rex) * w))),
                "mouth": (mx, my),
            }
        )
        # Mouth box: LatentSync regenerates the lower face, so anything covering it breaks the result.
        mbx0, mbx1 = mx - 0.45 * f["w"], mx + 0.45 * f["w"]
        mby0, mby1 = my - 0.22 * f["h"], my + 0.38 * f["h"]
        fbx0, fbx1 = f["x"] - 0.1 * f["w"], f["x"] + 1.1 * f["w"]
        fby0, fby1 = f["y"] - 0.1 * f["h"], f["y"] + 1.15 * f["h"]
        over_mouth = near_face = False
        hands = self._hands.process(rgb)
        for hl in hands.multi_hand_landmarks or []:
            for lm in hl.landmark:
                if mbx0 <= lm.x <= mbx1 and mby0 <= lm.y <= mby1:
                    over_mouth = True
                if fbx0 <= lm.x <= fbx1 and fby0 <= lm.y <= fby1:
                    near_face = True
        res["hand_over_mouth"] = over_mouth
        res["hand_near_face"] = near_face
        x0, x1 = max(0, int(f["x"] * w)), min(w, int((f["x"] + f["w"]) * w))
        y0, y1 = max(0, int(f["y"] * h)), min(h, int((f["y"] + f["h"]) * h))
        crop = rgb[y0:y1, x0:x1]
        if crop.size:
            gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
            gray = cv2.resize(gray, (128, 128), interpolation=cv2.INTER_AREA)
            res["sharp"] = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            res["bright"] = float(gray.mean())
        else:
            res["sharp"], res["bright"] = 0.0, 0.0
        return res


def detect_cuts(path):
    """Times of hard edits (cuts, jump cuts, punch-in zooms), checked on every frame at 96x54.

    An edit is an isolated spike: one frame differs much more from the previous one than its
    neighbours do. Talking and gesturing raise the difference over several frames in a row, and
    duplicated frames (25 -> 30 fps conversions) only add zeros, so neither looks like a spike.
    """
    info = probe(path)
    w, h = 96, 54
    fps = info.get("fps") or 25.0
    # fps filter: constant output rate, so frame i is at i/fps even for variable-frame-rate phone videos
    cmd = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(path), "-an",
           "-vf", f"fps={fps:.6f},scale={w}:{h},format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    diffs, prev = [0.0], None
    try:
        while True:
            buf = proc.stdout.read(w * h)
            if len(buf) < w * h:
                break
            cur = np.frombuffer(buf, np.uint8).astype(np.int16)
            if prev is not None:
                diffs.append(float(np.abs(cur - prev).mean()))
            prev = cur
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()
    dup = 0.3  # a repeated frame (frame-rate conversion) differs by almost nothing
    n = len(diffs)

    def nb(i, step):
        j = i + step
        while 0 <= j < n and diffs[j] < dup:
            j += step
        return diffs[j] if 0 <= j < n else 0.0

    cuts = []
    for i in range(1, n):
        d = diffs[i]
        dup_adj = diffs[i - 1] < dup or (i + 1 < n and diffs[i + 1] < dup)
        around = max(nb(i, -1), nb(i, 1), 0.5)
        # next to a duplicate, the catch-up frame carries two frames of motion, so demand a bigger jump
        if d > 25 or (d > 2.5 and d > (6.0 if dup_adj else 3.0) * around):
            cuts.append(i / fps)
    return cuts


def is_cut(prev_a, a) -> bool:
    """Backup for edits the frame test misses: the face jumps or changes size a lot in 0.2 s."""
    if prev_a and a and prev_a.get("n_faces") == 1 and a.get("n_faces") == 1:
        if abs(a["cx"] - prev_a["cx"]) > 0.12 or abs(a["cy"] - prev_a["cy"]) > 0.12:
            return True
        if abs(a["fh"] / prev_a["fh"] - 1) > 0.3:
            return True
    return False


def column_profile(rgb) -> np.ndarray:
    """Mean edge energy per column; blurred side fills (vertical clip inside a 16:9 frame) are near zero."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return np.abs(cv2.Laplacian(gray, cv2.CV_32F)).mean(axis=0)


def content_span(profile, cx):
    """(x0, x1) as fractions of the width holding real picture, or (0, 1) when the whole frame is real.

    Only reacts to the typical YouTube layout: a sharp clip of standard width with clear steps to a
    soft/blurred fill on both sides. A plain wall fades gradually and is left alone.
    """
    n = len(profile)
    k = np.convolve(profile, np.ones(9) / 9, mode="same")
    ref = np.percentile(k, 90)
    if ref <= 0:
        return 0.0, 1.0
    # a wide average bridges smooth areas inside the clip (skin, a plain T-shirt)
    wide = np.convolve(profile, np.ones(31) / 31, mode="same")
    sharp = wide > 0.25 * ref
    c = min(n - 1, max(0, int(cx * n)))
    if not sharp[c]:
        near = [i for i in range(max(0, c - n // 10), min(n, c + n // 10)) if sharp[i]]
        if not near:
            return 0.0, 1.0
        c = min(near, key=lambda i: abs(i - c))
    x0 = c
    while x0 > 0 and sharp[x0 - 1]:
        x0 -= 1
    x1 = c
    while x1 < n - 1 and sharp[x1 + 1]:
        x1 += 1
    # the wide average blurs the edges outwards; pull them back to where the real picture starts
    fine = profile > 0.3 * ref
    while x0 < x1 and not fine[x0]:
        x0 += 1
    while x1 > x0 and not fine[x1]:
        x1 -= 1
    m = max(3, n // 200)  # skip the edge step itself plus a small safety margin
    x0, x1 = x0 + m, x1 - m
    width = (x1 - x0 + 1) / n
    if width > 0.85 or width < 0.25:
        return 0.0, 1.0
    out_l = k[max(0, x0 - 25) : max(1, x0 - 5)].mean() if x0 > 25 else ref
    out_r = k[x1 + 5 : x1 + 25].mean() if x1 < n - 26 else ref
    inside = k[x0 : x1 + 1].mean()
    if inside < 3 * max(out_l, out_r, 1e-6):
        return 0.0, 1.0
    return x0 / n, (x1 + 1) / n


def frame_ok(a, strict=True) -> bool:
    """Frame usable as lip-sync base."""
    if a.get("n_faces") != 1:
        return False
    if a["hand_over_mouth"]:
        return False
    if a["yaw"] > (0.32 if strict else 0.4) or abs(a["roll"]) > 18:
        return False
    if a["bright"] < 45 or a["bright"] > 235:
        return False
    return True
