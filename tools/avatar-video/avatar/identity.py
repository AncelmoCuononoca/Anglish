"""Keep only the main person: group segments by face identity (InsightFace ArcFace embeddings).

His edits can contain guests, street interviews or clips of other creators. Every one of those is
"one frontal face", so without this check the tool could put Anselmo's voice on someone else's mouth.
"""

import subprocess
from pathlib import Path

import cv2
import numpy as np

from .common import ffmpeg_bin

SAME_PERSON = 0.45  # cosine similarity of ArcFace embeddings; same person is usually > 0.55


def _frame(video, t, width=960):
    p = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", f"{max(0.0, t):.2f}", "-i", str(video),
         "-frames:v", "1", "-vf", f"scale={width}:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True,
    )
    if p.returncode != 0 or not p.stdout:
        return None
    return cv2.imdecode(np.frombuffer(p.stdout, np.uint8), cv2.IMREAD_COLOR)  # BGR, as insightface expects


def _face_app(root):
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(
        name="buffalo_l", root=str(root), allowed_modules=["detection", "recognition"],
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def mark_main_person(segs, model_root: Path, log=print):
    """Set s['other_person'] on every segment. Returns False if the check could not run."""
    try:
        app = _face_app(model_root)
    except Exception as e:
        log(f"   AVISO: não consegui verificar se é sempre a mesma pessoa ({e}); confirma na pré-visualização")
        for s in segs:
            s["other_person"] = False
        return False
    for s in segs:
        embs = []
        for t in (s["start"] + 0.3, (s["start"] + s["end"]) / 2, s["end"] - 0.3):
            img = _frame(s["video"], t)
            if img is None:
                continue
            faces = app.get(img)
            if faces:
                f = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                embs.append(f.normed_embedding)
        if embs:
            e = np.mean(embs, axis=0)
            s["_emb"] = e / (np.linalg.norm(e) + 1e-9)

    clusters = []  # {"sum": weighted embedding sum, "secs": seconds}
    for s in sorted(segs, key=lambda s: -s["dur"]):
        e = s.get("_emb")
        if e is None:
            s["_person"] = None
            continue
        best = None
        for ci, c in enumerate(clusters):
            sim = float(np.dot(e, c["sum"] / np.linalg.norm(c["sum"])))
            if sim >= SAME_PERSON and (best is None or sim > best[1]):
                best = (ci, sim)
        if best:
            c = clusters[best[0]]
            c["sum"] = c["sum"] + e * s["dur"]
            c["secs"] += s["dur"]
            c["videos"].add(s["video"])
            s["_person"] = best[0]
        else:
            clusters.append({"sum": e * s["dur"], "secs": s["dur"], "videos": {s["video"]}})
            s["_person"] = len(clusters) - 1
    # Anselmo is in every one of his videos; a guest is usually in one. Then most screen time.
    main = max(range(len(clusters)), key=lambda i: (len(clusters[i]["videos"]), clusters[i]["secs"])) if clusters else None
    others = []
    for s in segs:
        # No identity read (face too small for the recogniser) counts as "not confirmed": leave it out.
        s["other_person"] = s.pop("_person", None) != main
        s.pop("_emb", None)
        if s["other_person"]:
            others.append(s["id"])
    if len(clusters) > 1 or others:
        log(f"   {len(clusters)} pessoas diferentes nos vídeos; fico só com a que aparece em mais vídeos")
    if others:
        log(f"   ignorados (outra pessoa ou cara não confirmada): {', '.join(others[:20])}{' ...' if len(others) > 20 else ''}")
    return True
