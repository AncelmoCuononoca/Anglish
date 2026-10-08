"""Join the lip-synced shots, burn captions, mix audio, export for Reels/Shorts."""

import shutil
from pathlib import Path

from .common import FPS, OUT_H, OUT_W, ffmpeg

FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"


def finish(shots, voice48, ass_path, out_mp4, work: Path, total_frames, music=None, music_db=-22):
    """Single final encode: concat (exact frame counts) -> captions -> H.264 1080x1920 + AAC."""
    inputs, chains = [], []
    for i, s in enumerate(shots):
        inputs += ["-i", s["synced"]]
        # Pad by cloning the last frame, then cut to the planned length: audio and video stay in sync.
        chains.append(
            f"[{i}:v]fps={FPS},scale={OUT_W}:{OUT_H}:flags=lanczos,setsar=1,"
            f"tpad=stop_mode=clone:stop=8,trim=end_frame={s['frames']},setpts=PTS-STARTPTS[v{i}]"
        )
    n = len(shots)
    vi = n
    inputs += ["-i", str(voice48)]
    ai = n + 1
    if music:
        inputs += ["-stream_loop", "-1", "-i", str(music)]
    # libass is pointed at relative paths (cwd=work) to dodge Windows drive-letter escaping in filters.
    local_ass = work / "captions.ass"
    if Path(ass_path) != local_ass:
        shutil.copyfile(ass_path, local_ass)
    fonts = work / "fonts"
    if FONTS_DIR.is_dir():
        shutil.copytree(FONTS_DIR, fonts, dirs_exist_ok=True)
    sub = "ass=captions.ass:fontsdir=fonts" if fonts.is_dir() else "ass=captions.ass"
    fc = ";".join(chains)
    fc += ";" + "".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[cat];[cat]{sub},format=yuv420p[vout]"
    dur = total_frames / FPS
    if music:
        fc += (
            f";[{vi}:a]aformat=sample_rates=48000:channel_layouts=mono,pan=stereo|c0=c0|c1=c0,asplit=2[vo][sc]"
            # level the track first so music_db means "this far under the voice" for any song
            f";[{ai}:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-14:LRA=20,"
            f"aformat=sample_rates=48000,volume={music_db}dB,atrim=0:{dur:.3f}[mu]"
            f";[mu][sc]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[duck]"
            f";[vo][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.84:level=disabled[aout]"
        )
    else:
        fc += f";[{vi}:a]aformat=sample_rates=48000,pan=stereo|c0=c0|c1=c0[aout]"
    (work / "filter.txt").write_text(fc, encoding="utf-8")  # kept for debugging
    tmp_out = work / "final.mp4"
    ffmpeg(
        [*inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
         "-r", str(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1",
         "-maxrate", "16M", "-bufsize", "32M", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{dur:.3f}",
         "-movflags", "+faststart", tmp_out.name],
        cwd=work,
    )
    out_mp4 = Path(out_mp4)
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tmp_out, out_mp4)
    return out_mp4
