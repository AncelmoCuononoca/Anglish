"""Run LatentSync (ByteDance, Apache-2.0) on each shot, loading the model once."""

import os
import shutil
import sys
import time
from pathlib import Path


class FaceNotFound(Exception):
    pass


class LatentSyncRunner:
    def __init__(self, cfg, log=print):
        self.cfg = cfg
        self.log = log
        self.ls_dir = Path(cfg["latentsync_dir"])
        if not (self.ls_dir / "latentsync").is_dir():
            raise SystemExit(f"LatentSync não está instalado em {self.ls_dir}. Corre o install.bat.")
        self._cwd = os.getcwd()
        os.chdir(self.ls_dir)  # LatentSync loads configs/ and checkpoints/ relative to cwd
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
        self._load(cfg["unet_config"], cfg["checkpoint"])

    def _load(self, unet_config, ckpt):
        torch = self.torch
        from diffusers import AutoencoderKL, DDIMScheduler
        from latentsync.models.unet import UNet3DConditionModel
        from latentsync.pipelines.lipsync_pipeline import LipsyncPipeline
        from latentsync.whisper.audio2feature import Audio2Feature
        from omegaconf import OmegaConf

        if not Path(ckpt).exists():
            raise SystemExit(f"Falta o modelo {ckpt}. Corre o install.bat.")
        self.config = OmegaConf.load(unet_config)
        fp16 = torch.cuda.get_device_capability()[0] > 7
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
        if self.cfg.get("deepcache", True):
            from DeepCache import DeepCacheSDHelper

            helper = DeepCacheSDHelper(pipe=self.pipeline)
            helper.set_params(cache_interval=3, cache_branch_id=0)
            helper.enable()
        self.loaded = (unet_config, ckpt)
        res = self.config.data.resolution
        self.log(f"LatentSync carregado ({ckpt}, {res}px, {'fp16' if fp16 else 'fp32'})")

    def _unload(self):
        del self.pipeline
        self.torch.cuda.empty_cache()

    def run(self, video_in, audio_in, video_out):
        from accelerate.utils import set_seed

        torch = self.torch
        tmp = self.ls_dir / "temp_avatar"
        for attempt in range(2):
            set_seed(int(self.cfg.get("seed", 1247)))
            try:
                t = time.time()
                self.pipeline(
                    video_path=str(video_in),
                    audio_path=str(audio_in),
                    video_out_path=str(video_out),
                    num_frames=self.config.data.num_frames,
                    num_inference_steps=int(self.cfg.get("inference_steps", 30)),
                    guidance_scale=float(self.cfg.get("guidance_scale", 1.5)),
                    weight_dtype=self.dtype,
                    width=self.config.data.resolution,
                    height=self.config.data.resolution,
                    mask_image_path=self.config.data.mask_image_path,
                    temp_dir=str(tmp),
                )
                torch.cuda.empty_cache()
                if not Path(video_out).exists():
                    raise RuntimeError("LatentSync não escreveu o vídeo de saída")
                return time.time() - t
            except RuntimeError as e:
                msg = str(e)
                if "Face not detected" in msg:
                    raise FaceNotFound(msg)
                oom = isinstance(e, torch.cuda.OutOfMemoryError) or "out of memory" in msg.lower()
                fb = self.cfg.get("fallback_checkpoint")
                if oom and attempt == 0 and fb and Path(fb).exists() and self.loaded[1] != fb:
                    self.log("Memória da placa insuficiente para este modelo; a mudar para o LatentSync 1.5 ...")
                    self._unload()
                    self._load(self.cfg["fallback_unet_config"], fb)
                    continue
                raise
            finally:
                shutil.rmtree(tmp, ignore_errors=True)

    def close(self):
        try:
            self._unload()
        finally:
            os.chdir(self._cwd)


def passthrough(video_in, video_out):
    """--lipsync none: keep the original mouth (to test the rest of the pipeline)."""
    shutil.copyfile(video_in, video_out)
    return 0.0
