"""Check the machine and pre-download every model, so the first video does not stall."""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from .common import load_config, save_config


def _ok(msg):
    print(f"  OK   {msg}")


def _bad(msg):
    print(f"  FALHA {msg}")


def gpu_info():
    exe = shutil.which("nvidia-smi") or r"C:\Windows\System32\nvidia-smi.exe"
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=20,
        ).stdout.strip().splitlines()
        name, mem, drv = [x.strip() for x in out[0].split(",")]
        return {"name": name, "vram_mb": int(float(mem)), "driver": drv}
    except Exception:
        return None


def run(test=False):
    cfg = load_config()
    problems = 0
    print("Placa gráfica:")
    g = gpu_info()
    if g:
        _ok(f"{g['name']}  {g['vram_mb'] / 1024:.1f} GB  driver {g['driver']}")
    else:
        _bad("nenhuma placa NVIDIA encontrada (nvidia-smi não responde)")
        problems += 1

    print("ffmpeg:")
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        filters = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
        if " ass " in filters:
            _ok("ffmpeg + ffprobe com libass (legendas)")
        else:
            _bad("este ffmpeg não tem libass; instala o build completo (winget install Gyan.FFmpeg)")
            problems += 1
    else:
        _bad("ffmpeg/ffprobe não estão no PATH")
        problems += 1

    print("PyTorch / CUDA:")
    try:
        import torch

        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            _ok(f"torch {torch.__version__}, {p.name}, {p.total_memory / 2**30:.1f} GB, sm_{p.major}{p.minor}")
        else:
            _bad(f"torch {torch.__version__} sem CUDA")
            problems += 1
    except Exception as e:
        _bad(f"torch não importa: {e}")
        problems += 1

    print("onnxruntime (detecção de cara do LatentSync):")
    try:
        import onnxruntime as ort

        if hasattr(ort, "preload_dlls"):
            try:
                ort.preload_dlls()
            except Exception:
                pass
        prov = ort.get_available_providers()
        if "CUDAExecutionProvider" in prov:
            _ok(f"onnxruntime {ort.__version__} com CUDA")
        else:
            print(f"  AVISO onnxruntime {ort.__version__} só CPU ({prov}); funciona, mas mais lento")
    except Exception as e:
        _bad(f"onnxruntime: {e}")
        problems += 1

    ls = Path(cfg["latentsync_dir"])
    print(f"LatentSync em {ls}:")
    for rel in (cfg["unet_config"], cfg["checkpoint"], "checkpoints/whisper/tiny.pt"):
        p = ls / rel
        if p.exists():
            _ok(rel)
        else:
            _bad(f"falta {rel}")
            problems += 1
    if cfg.get("fallback_checkpoint"):
        print(f"  info modelo de reserva: {cfg['fallback_checkpoint']}")

    print("A descarregar/verificar modelos auxiliares (só demora na primeira vez):")
    cwd = os.getcwd()
    try:
        os.chdir(ls)
        sys.path.insert(0, str(ls))
        from latentsync.utils.face_detector import FaceDetector

        FaceDetector(device="cuda")
        _ok("detector de cara insightface (buffalo_l)")
    except Exception as e:
        _bad(f"detector de cara: {e}")
        problems += 1
    finally:
        os.chdir(cwd)
    try:
        from diffusers import AutoencoderKL

        AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse")
        _ok("VAE stabilityai/sd-vae-ft-mse")
    except Exception as e:
        _bad(f"VAE: {e}")
        problems += 1
    try:
        from faster_whisper import WhisperModel

        WhisperModel(cfg["whisper_model"], device="cpu", compute_type="int8")
        _ok(f"Whisper {cfg['whisper_model']} (tempos das legendas)")
    except Exception as e:
        print(f"  AVISO Whisper indisponível ({e}); as legendas usam tempos aproximados")

    print("Voz clonada:")
    if cfg.get("tts_command"):
        _ok(f"tts_command = {cfg['tts_command']}")
    else:
        print("  AVISO tts_command vazio: passa --audio ao criar vídeos, ou configura a voz (ver CLAUDE.md)")

    if test and not problems:
        problems += _smoke_test(cfg)
    print()
    print("Tudo pronto." if not problems else f"{problems} problema(s) por resolver.")
    return problems


def _smoke_test(cfg):
    """Lip-sync 3 s of LatentSync's own demo to measure speed and VRAM."""
    from .common import FPS, ffmpeg, install_dir
    from .lipsync import LatentSyncRunner

    ls = Path(cfg["latentsync_dir"])
    work = install_dir() / "work" / "_smoke"
    work.mkdir(parents=True, exist_ok=True)
    vid, aud, out = work / "v.mp4", work / "a.wav", work / "out.mp4"
    ffmpeg(["-i", str(ls / "assets/demo1_video.mp4"), "-t", "3", "-r", str(FPS), "-an", str(vid)])
    ffmpeg(["-i", str(ls / "assets/demo1_audio.wav"), "-t", "3", "-ac", "1", "-ar", "16000", str(aud)])
    print("Teste de sincronização labial (3 s):")
    import torch

    runner = None
    try:
        runner = LatentSyncRunner(cfg)
        torch.cuda.reset_peak_memory_stats()
        t = time.time()
        runner.run(vid, aud, out)
        dt = time.time() - t
        peak = torch.cuda.max_memory_allocated() / 2**30
        _ok(f"3 s de vídeo em {dt:.0f} s (pico {peak:.1f} GB). Um vídeo de 50 s demora ~{dt * 50 / 3 / 60:.0f} min.")
        if runner.loaded[1] != cfg["checkpoint"]:
            cfg["unet_config"], cfg["checkpoint"] = runner.loaded
            save_config(cfg)
            print("  info a placa não aguenta o modelo maior; fica configurado o LatentSync 1.5")
        return 0
    except Exception as e:
        _bad(f"teste falhou: {e}")
        return 1
    finally:
        if runner:
            runner.close()
