"""Run LatentSync (ByteDance, Apache-2.0) on each shot, loading the model once."""

import contextlib
import gc
import os
import re
import shutil
import sys
import time
from pathlib import Path

OOM_RE = re.compile(r"out of memory|failed to allocate|NOT_ENOUGH_MEMORY|ALLOC_FAILED", re.I)


class FaceNotFound(Exception):
    pass


def use_fp16(torch, mode="auto"):
    if isinstance(mode, str) and mode.lower() in ("true", "1", "sim", "yes", "false", "0", "nao", "não", "no"):
        mode = mode.lower() in ("true", "1", "sim", "yes")
    if mode in (True, False):
        return mode
    major, _ = torch.cuda.get_device_capability()
    name = torch.cuda.get_device_name()
    # Ampere+ always; Turing RTX (20xx) has fp16 tensor cores. GTX 16xx/Pascal produce NaNs/black frames in fp16.
    return major >= 8 or (major == 7 and "RTX" in name.upper())


class LatentSyncRunner:
    def __init__(self, cfg, log=print):
        self.cfg = cfg
        self.log = log
        self.ls_dir = Path(cfg["latentsync_dir"]).resolve()
        if not (self.ls_dir / "latentsync").is_dir():
            raise SystemExit(f"LatentSync não está instalado em {self.ls_dir}. Corre o install.bat.")
        if str(self.ls_dir) not in sys.path:
            sys.path.insert(0, str(self.ls_dir))
        import torch

        try:  # ORT >= 1.21 can reuse the CUDA/cuDNN DLLs torch already ships
            import onnxruntime

            if hasattr(onnxruntime, "preload_dlls"):
                onnxruntime.preload_dlls()
        except Exception:
            pass
        if not torch.cuda.is_available():
            raise SystemExit("A placa NVIDIA não está disponível para o PyTorch (CUDA). Corre: avatar doctor")
        self.torch = torch
        # Windows drivers silently spill VRAM into system RAM (many times slower) instead of failing.
        # Capping the allocator below the card's size turns that into a real OOM, so the 1.5 fallback kicks in.
        total = torch.cuda.get_device_properties(0).total_memory
        torch.cuda.set_per_process_memory_fraction(max(0.5, (total - 1.5 * 2**30) / total), 0)
        self.pipeline = self.helper = None
        self._load(cfg["unet_config"], cfg["checkpoint"])
        self._patch_reader()

    @contextlib.contextmanager
    def _in_ls_dir(self):
        # LatentSync loads configs/ and checkpoints/ relative to cwd; only stay there while it runs.
        prev = os.getcwd()
        os.chdir(self.ls_dir)
        try:
            yield
        finally:
            os.chdir(prev)

    def _patch_reader(self):
        # Our base clips are already constant 25 fps. Upstream re-encodes them (CRF 18, through an unquoted
        # shell command and a shared "temp" folder) before reading; read them directly instead.
        import latentsync.pipelines.lipsync_pipeline as lp

        orig = lp.read_video
        if not getattr(orig, "_avatar_patched", False):
            def read_video(path, change_fps=True, use_decord=True):
                return orig(path, change_fps=False, use_decord=use_decord)

            read_video._avatar_patched = True
            lp.read_video = read_video

    def _load(self, unet_config, ckpt):
        torch = self.torch
        with self._in_ls_dir():
            from diffusers import AutoencoderKL, DDIMScheduler
            from latentsync.models.unet import UNet3DConditionModel
            from latentsync.pipelines.lipsync_pipeline import LipsyncPipeline
            from latentsync.whisper.audio2feature import Audio2Feature
            from omegaconf import OmegaConf

            if not Path(ckpt).exists():
                raise SystemExit(f"Falta o modelo {ckpt}. Corre o install.bat.")
            self.config = OmegaConf.load(unet_config)
            fp16 = use_fp16(torch, self.cfg.get("fp16", "auto"))
            self.dtype = torch.float16 if fp16 else torch.float32
            whisper = "checkpoints/whisper/small.pt" if self.config.model.cross_attention_dim == 768 else "checkpoints/whisper/tiny.pt"
            audio_encoder = Audio2Feature(
                model_path=whisper,
                device="cuda",
                num_frames=self.config.data.num_frames,
                audio_feat_length=self.config.data.audio_feat_length,
            )
            vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse", torch_dtype=self.dtype)
            vae.config.scaling_factor = 0.18215
            vae.config.shift_factor = 0
            # Encode/decode the 16-frame batches one frame at a time: big VRAM saving, same output.
            vae.enable_slicing()
            unet, _ = UNet3DConditionModel.from_pretrained(OmegaConf.to_container(self.config.model), ckpt, device="cpu")
            unet = unet.to(dtype=self.dtype)
            self.pipeline = LipsyncPipeline(
                vae=vae, audio_encoder=audio_encoder, unet=unet, scheduler=DDIMScheduler.from_pretrained("configs")
            ).to("cuda")
        # DeepCache keeps extra activations around; skip it in fp32 where memory is tightest.
        if self.cfg.get("deepcache", True) and fp16:
            from DeepCache import DeepCacheSDHelper

            self.helper = DeepCacheSDHelper(pipe=self.pipeline)
            self.helper.set_params(cache_interval=3, cache_branch_id=0)
            self.helper.enable()
        self.loaded = (unet_config, ckpt)
        res = self.config.data.resolution
        self.log(f"LatentSync carregado ({ckpt}, {res}px, {'fp16' if fp16 else 'fp32'})")

    def _unload(self):
        if self.helper is not None:
            try:
                self.helper.disable()
            except Exception:
                pass
            self.helper = None
        if self.pipeline is not None:
            self.pipeline.image_processor = None
        self.pipeline = None
        gc.collect()
        self.torch.cuda.empty_cache()

    def run(self, video_in, audio_in, video_out):
        from accelerate.utils import set_seed

        torch = self.torch
        video_out = Path(video_out)
        video_out.unlink(missing_ok=True)
        # Per-run temp folder (no spaces: it lives under the work dir), deleted by the pipeline itself.
        tmp = video_out.parent / "_ls_tmp"
        for attempt in range(2):
            set_seed(int(self.cfg.get("seed", 1247)))
            switch = False
            try:
                t = time.time()
                with self._in_ls_dir():
                    self.pipeline(
                        video_path=str(video_in),
                        audio_path=str(audio_in),
                        video_out_path=str(video_out.parent / "_ls_mux.mp4"),
                        num_frames=self.config.data.num_frames,
                        num_inference_steps=int(self.cfg.get("inference_steps", 30)),
                        guidance_scale=float(self.cfg.get("guidance_scale", 1.5)),
                        weight_dtype=self.dtype,
                        width=self.config.data.resolution,
                        height=self.config.data.resolution,
                        mask_image_path=self.config.data.mask_image_path,
                        temp_dir=str(tmp),
                    )
                # Take the CRF-13 frames the pipeline wrote, not its extra CRF-18 re-encode (audio comes later).
                frames = tmp / "video.mp4"
                if not frames.exists():
                    raise RuntimeError("LatentSync não escreveu o vídeo de saída")
                shutil.copyfile(frames, video_out)
                torch.cuda.empty_cache()
                return time.time() - t
            except Exception as e:
                msg = str(e)
                if "Face not detected" in msg:
                    raise FaceNotFound(msg)
                oom = isinstance(e, torch.cuda.OutOfMemoryError) or bool(OOM_RE.search(msg))
                fb = self.cfg.get("fallback_checkpoint")
                with self._in_ls_dir():
                    fb_ok = bool(fb) and Path(fb).exists()
                switch = oom and attempt == 0 and fb_ok and self.loaded[1] != fb
                if not switch:
                    raise
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
                (video_out.parent / "_ls_mux.mp4").unlink(missing_ok=True)
            if switch:  # outside the except block, so the failed call's frames (and VRAM) are released
                self.log("Memória da placa insuficiente para este modelo; a mudar para o LatentSync 1.5 ...")
                self._unload()
                self._load(self.cfg["fallback_unet_config"], self.cfg["fallback_checkpoint"])

    def close(self):
        self._unload()


def passthrough(video_in, video_out):
    """--lipsync none: keep the original mouth (to test the rest of the pipeline)."""
    shutil.copyfile(video_in, video_out)
    return 0.0
