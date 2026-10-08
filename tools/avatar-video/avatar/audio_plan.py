"""Prepare the voice track and plan the shots (jump cuts land on pauses, never mid-word)."""

import json
import re

import numpy as np

from .common import FPS, SR_MODEL, SR_OUT, ffmpeg, read_audio, write_wav

SAMPLES_PER_FRAME = SR_MODEL // FPS  # 640


def _loudnorm(src, dst, sr):
    # Two-pass EBU R128. The mono voice is later played on both stereo channels, which BS.1770
    # measures 3 dB louder, so -17 LUFS here lands at -14 LUFS (what Instagram/YouTube target).
    import subprocess

    from .common import ffmpeg_bin

    p = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-nostdin", "-i", str(src), "-af",
         "loudnorm=I=-17:TP=-2:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr)
    if m:
        st = json.loads(m.group(0))
        af = (
            "loudnorm=I=-17:TP=-2:LRA=11:"
            f"measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:"
            f"measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true"
        )
    else:
        af = "loudnorm=I=-17:TP=-2:LRA=11"
    ffmpeg(["-i", str(src), "-af", af, "-ar", str(sr), "-ac", "1", str(dst)])


def _envelope_db(x, sr, win=0.02):
    n = int(sr * win)
    frames = len(x) // n
    if frames == 0:
        return np.array([-120.0])
    rms = np.sqrt(np.mean(x[: frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-12)


def speech_mask(x, sr, win=0.02):
    db = _envelope_db(x, sr, win)
    loud = np.percentile(db, 90)
    thr = max(loud - 28, -50)
    return db > thr, win


def find_pauses(x, sr, min_pause=0.16):
    """Return [(start, end)] of pauses in seconds."""
    mask, win = speech_mask(x, sr)
    pauses, i = [], 0
    while i < len(mask):
        if not mask[i]:
            j = i
            while j < len(mask) and not mask[j]:
                j += 1
            if (j - i) * win >= min_pause:
                pauses.append((i * win, j * win))
            i = j
        else:
            i += 1
    return pauses


def quietest_point(x, sr, lo, hi, win=0.02):
    db = _envelope_db(x, sr, win)
    i0, i1 = int(lo / win), max(int(lo / win) + 1, int(hi / win))
    seg = db[i0:i1]
    if seg.size == 0:
        return (lo + hi) / 2
    # smooth over 60 ms so a single quiet sample inside a word does not win
    k = np.convolve(seg, np.ones(3) / 3, mode="same")
    return (i0 + int(np.argmin(k)) + 0.5) * win


def prepare_voice(src, work):
    """Trim leading/trailing silence, normalise loudness. Returns (wav48, wav16, duration_s)."""
    raw = read_audio(src, SR_MODEL)
    mask, win = speech_mask(raw, SR_MODEL)
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        raise SystemExit("O áudio da voz está vazio ou em silêncio.")
    t0 = max(0.0, idx[0] * win - 0.12)
    t1 = min(len(raw) / SR_MODEL, (idx[-1] + 1) * win + 0.45)
    trimmed = work / "voice_trim.wav"
    ffmpeg(["-i", str(src), "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}", "-ac", "1", "-ar", str(SR_OUT), str(trimmed)])
    wav48 = work / "voice.wav"
    _loudnorm(trimmed, wav48, SR_OUT)
    x = read_audio(wav48, SR_MODEL)
    # Pad to a whole number of video frames so audio and video lengths match exactly.
    n_frames = int(np.ceil(len(x) / SAMPLES_PER_FRAME))
    x = np.pad(x, (0, n_frames * SAMPLES_PER_FRAME - len(x)))
    wav16 = work / "voice16.wav"
    write_wav(wav16, x, SR_MODEL)
    return wav48, wav16, n_frames


def plan_shots(wav16, n_frames, min_len=2.6, target=4.3, max_len=6.8, first_max=3.6):
    """Split the timeline into shots of ~3-7 s; each cut sits in the middle of a pause."""
    x = read_audio(wav16, SR_MODEL)
    total = n_frames / FPS
    cands = [(a + b) / 2 for a, b in find_pauses(x, SR_MODEL) if 0.5 < (a + b) / 2 < total - 1.2]
    cuts, t = [], 0.0
    first = True
    while True:
        lo, hi = t + min_len, t + (first_max if first else max_len)
        tgt = t + (min(target, first_max - 0.4) if first else target)
        window = [c for c in cands if lo <= c <= hi]
        if window:
            c = min(window, key=lambda c: abs(c - tgt))
        elif hi < total - min_len:
            # No real pause in range (fast voice): cut at the quietest moment, normally a gap between words.
            c = quietest_point(x, SR_MODEL, lo, hi)
        else:
            break
        if total - c < min_len:
            break
        cuts.append(c)
        t = c
        first = False
    frames = [0] + [int(round(c * FPS)) for c in cuts] + [n_frames]
    shots = []
    for k in range(len(frames) - 1):
        f0, f1 = frames[k], frames[k + 1]
        if f1 - f0 < 10:
            continue
        shots.append({"k": len(shots), "f0": f0, "f1": f1, "frames": f1 - f0, "t0": f0 / FPS, "t1": f1 / FPS})
    return shots


def slice_audio(wav16, shots, work):
    x = read_audio(wav16, SR_MODEL)
    for s in shots:
        seg = x[s["f0"] * SAMPLES_PER_FRAME : s["f1"] * SAMPLES_PER_FRAME]
        p = work / f"shot_{s['k']:02d}_audio.wav"
        write_wav(p, seg, SR_MODEL)
        s["audio"] = str(p)
    return shots
