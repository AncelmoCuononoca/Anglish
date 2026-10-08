"""Word-timed burned-in captions (ASS) for the vertical video."""

import difflib
import re
import unicodedata

from .audio_plan import speech_mask
from .common import OUT_H, OUT_W, SR_MODEL, read_audio

YELLOW = "&H0000D4FF"  # #FFD400 in ASS BGR
WHITE = "&H00FFFFFF"


def _norm(w):
    w = unicodedata.normalize("NFKD", w.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", w)


def script_words(text):
    return [w for w in re.split(r"\s+", text.strip()) if w]


def _whisper_words(wav16, model_name, prompt, log):
    try:
        from faster_whisper import WhisperModel
    except Exception:
        log("faster-whisper não instalado; legendas com tempos aproximados")
        return None
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segs, _ = model.transcribe(
            str(wav16), language="pt", word_timestamps=True, vad_filter=False, beam_size=5,
            initial_prompt=prompt[:220],
        )
        return [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or [])]
    except Exception as e:
        log(f"Whisper falhou ({e}); legendas com tempos aproximados")
        return None


def _proportional(words, wav16):
    """Fallback: spread words over the detected speech, weighted by length."""
    x = read_audio(wav16, SR_MODEL)
    mask, win = speech_mask(x, SR_MODEL)
    speech_t = [i * win for i, m in enumerate(mask) if m]
    if not speech_t:
        return [(0.0, 0.3)] * len(words)
    weights = [max(2, len(_norm(w))) + 1 for w in words]
    total = sum(weights)
    out, acc = [], 0
    for wgt in weights:
        a = speech_t[min(len(speech_t) - 1, int(acc / total * len(speech_t)))]
        acc += wgt
        b = speech_t[min(len(speech_t) - 1, int(acc / total * len(speech_t)) - 1)] + win
        out.append((a, max(b, a + 0.12)))
    return out


def align(text, wav16, model_name="small", log=print):
    words = script_words(text)
    heard = _whisper_words(wav16, model_name, text, log)
    if not heard:
        return list(zip(words, _proportional(words, wav16)))
    a = [_norm(w) for w in words]
    b = [_norm(w) for w, _, _ in heard]
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for blk in sm.get_matching_blocks():
        for i in range(blk.size):
            _, s, e = heard[blk.b + i]
            times[blk.a + i] = (s, e)
    # Words Whisper heard differently (numbers, names): interpolate between known neighbours.
    known = [i for i, t in enumerate(times) if t]
    if not known:
        return list(zip(words, _proportional(words, wav16)))
    i = 0
    while i < len(words):
        if times[i]:
            i += 1
            continue
        j = i
        while j < len(words) and not times[j]:
            j += 1
        n = j - i  # words i..j-1 are unknown
        if i > 0 and j < len(words):
            t0, t1 = times[i - 1][1], times[j][0]
        elif j < len(words):
            t1 = times[j][0]
            t0 = max(0.0, t1 - 0.3 * n)
        else:
            t0 = times[i - 1][1]
            t1 = t0 + 0.3 * n
        span = max(t1 - t0, 0.12 * n)
        for k in range(n):
            times[i + k] = (t0 + span * k / n, t0 + span * (k + 1) / n)
        i = j
    return list(zip(words, times))


def _esc(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")")


def _ts(t):
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _groups(timed, max_words=3, max_chars=16):
    groups, cur = [], []
    for w, t in timed:
        if cur and len(" ".join(x for x, _ in cur + [(w, t)])) > max_chars:
            groups.append(cur)
            cur = []
        cur.append((w, t))
        if len(cur) >= max_words or re.search(r"[.!?,;:]$", w):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def _fit(text, max_chars=17):
    """Shrink a caption that is still too wide for one line (one very long word)."""
    n = len(text)
    if n <= max_chars:
        return ""
    k = max(55, int(100 * max_chars / n))
    return f"\\fscx{k}\\fscy{k}"


def _wrap(text, width=22):
    lines, cur = [], ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return r"\N".join(lines)


def build_ass(timed, out_path, font="Montserrat ExtraBold", uppercase=False, hook=None, popups=()):
    """timed: [(word, (start, end))]. popups: [(start, end, text)] shown at the top."""
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {OUT_W}
PlayResY: {OUT_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},92,{WHITE},{WHITE},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1
Style: Top,{font},62,{WHITE},{WHITE},&H40000000,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    groups = _groups(timed)
    for gi, g in enumerate(groups):
        g_end = groups[gi + 1][0][1][0] if gi + 1 < len(groups) else g[-1][1][1] + 0.4
        g_end = min(g_end, g[-1][1][1] + 0.6)
        for wi, (w, (s, e)) in enumerate(g):
            e2 = g[wi + 1][1][0] if wi + 1 < len(g) else g_end
            if e2 <= s:
                e2 = s + 0.05
            parts = []
            for wj, (w2, _) in enumerate(g):
                txt = _esc(w2.upper() if uppercase else w2)
                parts.append(f"{{\\c{YELLOW}}}{txt}{{\\c{WHITE}}}" if wj == wi else txt)
            fit = _fit(" ".join(x for x, _ in g))
            pos = f"{{\\pos({OUT_W // 2},{int(OUT_H * 0.66)}){fit}}}"
            lines.append(f"Dialogue: 1,{_ts(s)},{_ts(e2)},Cap,,0,0,0,,{pos}{' '.join(parts)}")
    top_y = int(OUT_H * 0.11)  # above the head: assemble.py puts the face centre at 36% height
    if hook:
        hook_end = min(3.2, timed[min(len(timed) - 1, 8)][1][1] + 0.5) if timed else 3.0
        lines.append(f"Dialogue: 2,{_ts(0)},{_ts(hook_end)},Top,,0,0,0,,{{\\pos({OUT_W // 2},{top_y})\\fad(120,200)}}{_wrap(_esc(hook))}")
    for s, e, txt in popups:
        lines.append(f"Dialogue: 2,{_ts(s)},{_ts(e)},Top,,0,0,0,,{{\\pos({OUT_W // 2},{top_y})\\fad(100,150)}}{_wrap(_esc(txt))}")
    out_path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    return out_path


def popup_times(timed, items, hook_end=3.2, show=2.2):
    """items: [{'phrase_trigger': str, 'text': str}] -> [(start, end, text)] without overlaps."""
    norm_words = [_norm(w) for w, _ in timed]
    res, busy_until = [], hook_end
    for it in items:
        trig = [_norm(w) for w in script_words(it.get("phrase_trigger", ""))]
        trig = [t for t in trig if t]
        if not trig:
            continue
        for i in range(len(norm_words) - len(trig) + 1):
            if norm_words[i : i + len(trig)] == trig:
                s = max(timed[i][1][0], busy_until)
                res.append((s, s + show, it["text"]))
                busy_until = s + show + 0.2
                break
    return res
