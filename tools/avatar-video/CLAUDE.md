# Avatar video maker: instructions for Claude (local session on Anselmo's Windows PC)

Anselmo (Angolan creator living in Portugal, speaks Portuguese) asks for a short vertical video "de mim a falar"
about a topic. Your job: research, write the script, generate his cloned voice, lip-sync it onto his real footage
with this tool, check the result, and hand him a ready MP4 + caption. Talk to him in Portuguese (PT, "tu").

## One-time setup (skip what `avatar.bat doctor` reports as OK)

1. **Install**: run `install.bat` (or `powershell -ExecutionPolicy Bypass -File install.ps1`) in the background and
   poll it; it downloads several GB. It picks LatentSync 1.6 (>=15 GB VRAM) or 1.5 (8-15 GB) and ends with
   `doctor --test`, which prints how long a 50 s video will take.
2. **Voice clone**: an earlier session cloned his voice. Look on the Desktop for the zipped folder
   `voz Anselmo Nuvem` (name may vary slightly; search the Desktop for "voz"). Unzip it to
   `%LOCALAPPDATA%\AvatarAnselmo\voz`, work out which TTS engine and reference audio it uses (read its scripts
   and README; he said there are many audios, so find the one used for the last generated audio and reuse those
   settings), and make a one-line command that reads a UTF-8 text file and writes a WAV. Then:
   `avatar.bat config tts_command="<python> <script> --texto {text_file} --saida {out_wav}"`
   (`{text_file}` and `{out_wav}` are replaced with quoted paths). Test it on one sentence.
3. **Footage**: his talking videos are in a Desktop folder like `videos para clonar o meu avatar` (search the
   Desktop for "clonar"). They are YouTube-style edits: him sitting and talking, moving hands and arms,
   background music, possibly B-roll, zooms and burned-in text. Run
   `avatar.bat select --footage "<folder>"`, then **look at** `%LOCALAPPDATA%\AvatarAnselmo\work\footage_preview.jpg`
   and `footage_preview_all.jpg` (Read the images). The tool already drops frames without exactly one frontal
   face, frames with a hand over the mouth and hard cuts; you must still reject segments with burned-in
   captions/graphics near the face, other people, or bad framing. Remember the ids to pass as `--exclude`, or
   pick another source video with `--video "<file name>"` if it looks better (one source video per short keeps
   his outfit consistent; `--all-videos` mixes them).

## Every video

1. **Research** the topic on the web (prefer sources from the last 12 months; DECO PROteste, official sites,
   major Portuguese press). Never invent numbers.
2. **Script** as JSON in `roteiros/<slug>.json` (see `roteiros/supermercados-portugal.json`):
   `script` (spoken text only), `hook_on_screen`, `on_screen_texts` [{phrase_trigger, text}],
   `caption_instagram`, `title_shorts`, `hashtags`, `facts_used` (with URLs).
   Rules: 120-145 words (~50 s); hook in the first sentence; informal warm Portuguese with a light Angolan
   flavour that Portuguese and Brazilian viewers understand; short sentences; no em dashes, parentheses,
   emojis or lists in `script`; write numbers, euros and percentages in words so the TTS reads them right;
   end with a call to follow + a question for comments.
3. **Make it**: `avatar.bat video --script roteiros\<slug>.json [--exclude ...] [--music <file>]`.
   It runs for a while; start it in the background and poll the output.
4. **Check before delivering**: extract frames at 6-8 timestamps with ffmpeg and look at them (mouth region,
   teeth, captions not covering the face, no frozen frames at cuts); confirm with ffprobe that it is
   1080x1920, 25 fps, video and audio the same length. If the mouth is blurry raise `inference_steps`
   (40-50); if it jitters lower `guidance_scale` (1.2-1.3); if one shot is bad, `--exclude` that segment id
   (shown in the log and in `work\<run>\shots.json`) and run again.
5. **Deliver**: give him the MP4 path in `Desktop\Videos Avatar\` and the `.txt` caption next to it. Remind him
   once to tick the AI-content label when posting (YouTube "altered or synthetic content", Instagram "AI info").

## Troubleshooting

- `avatar.bat doctor` explains most problems. `--lipsync none` runs everything except the lip-sync (fast test).
- CUDA out of memory: if `fallback_checkpoint` exists the tool switches to LatentSync 1.5 by itself; otherwise
  re-run `install.bat` (it downloads 1.5 on 15-18 GB cards) or set
  `unet_config=configs/unet/stage2.yaml` with a 1.5 checkpoint.
- "Face not detected": the tool re-cuts that shot from other footage up to 3 times; exclude the segment if it
  keeps failing.
- Work files live in `%LOCALAPPDATA%\AvatarAnselmo\work\<run>\` (LatentSync needs paths without spaces).
- Only ever use Anselmo's own face and voice with this tool.
