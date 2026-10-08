# Installs the avatar video maker (LatentSync lip-sync) on this Windows PC. Run it through install.bat.
# Plain ASCII on purpose: Windows PowerShell 5.1 misreads accented characters in BOM-less scripts.
param([switch]$Force)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest is much faster without the progress bar

$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Join-Path $env:LOCALAPPDATA "AvatarAnselmo"
# LatentSync runs ffmpeg through the shell without quoting paths, so no spaces allowed here.
if ($Root.Contains(" ")) { $Root = "C:\AvatarAnselmo" }
$LsCommit = "a229c3948406bc2cf6eaf4873e662e70c6a04746"  # bytedance/LatentSync, 2025-06-20 (v1.6)
$LsDir = Join-Path $Root "LatentSync"
$Venv = Join-Path $Root "venv"
$Py = Join-Path $Venv "Scripts\python.exe"
New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
                (Join-Path $env:USERPROFILE ".local\bin") + ";" +
                (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links")
}
function Need-Winget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "O winget nao existe neste Windows. Instala o 'App Installer' da Microsoft Store e corre outra vez."
    }
}

# 1. GPU ---------------------------------------------------------------------------------------------
Say "A verificar a placa grafica"
$smi = (Get-Command nvidia-smi -ErrorAction SilentlyContinue).Source
if (-not $smi -and (Test-Path "$env:WINDIR\System32\nvidia-smi.exe")) { $smi = "$env:WINDIR\System32\nvidia-smi.exe" }
if (-not $smi) { throw "Nao encontrei placa NVIDIA (nvidia-smi). A sincronizacao labial precisa de uma NVIDIA com 8 GB ou mais." }
# PowerShell 5.1 turns redirected native stderr into terminating errors under "Stop"; relax it for this probe.
$ErrorActionPreference = "Continue"
$line = & $smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader,nounits 2>$null | Select-Object -First 1
if (-not $line -or $line -match "not a valid field") {  # old drivers do not know compute_cap
    $line = (& $smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1) + ", 0"
}
$ErrorActionPreference = "Stop"
$parts = $line.Split(",") | ForEach-Object { $_.Trim() }
$GpuName = $parts[0]
$VramMb = [int][double]$parts[1]
$Cc = 0.0
[void][double]::TryParse($parts[2], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$Cc)
Write-Host ("    {0}, {1:N1} GB" -f $GpuName, ($VramMb / 1024))

# LatentSync 1.6 (512 px, sharper teeth/lips) officially needs 18 GB; 1.5 (256 px) needs 8 GB, both in fp16.
# With VAE slicing (see avatar/lipsync.py) 1.6 usually fits in 16 GB, so 15-18 GB cards get 1.6 plus 1.5 as automatic fallback.
# Cards without usable fp16 (GTX 10xx/16xx, compute capability below 7.5) run in fp32 and need about twice the memory.
$Fp32 = ($Cc -gt 0 -and $Cc -lt 7.5) -or ($GpuName -match "GTX")
$EffMb = if ($Fp32) { [int]($VramMb / 2) } else { $VramMb }
if ($Fp32) { Write-Host "    Esta placa nao tem fp16 rapido: conta como $([math]::Round($EffMb/1024,1)) GB para o modelo." }
if ($EffMb -ge 17000) { $Main = "1.6"; $Fallback = $null }
elseif ($EffMb -ge 14500) { $Main = "1.6"; $Fallback = "1.5" }
elseif ($EffMb -ge 7500) { $Main = "1.5"; $Fallback = $null }
elseif ($Force) { $Main = "1.5"; $Fallback = $null; Write-Host "    AVISO: menos de 8 GB, vai ser muito lento ou falhar." -ForegroundColor Yellow }
else { throw "A placa tem $([math]::Round($VramMb/1024,1)) GB. O LatentSync precisa de pelo menos 8 GB em fp16 (usa -Force para tentar mesmo assim)." }

# RTX 50xx (Blackwell, compute capability 12.x) needs a CUDA 12.8 build of PyTorch.
if ($Cc -ge 12 -or $GpuName -match "RTX 50") {
    $TorchIndex = "https://download.pytorch.org/whl/cu128"; $Torch = "torch==2.7.1"; $TorchVision = "torchvision==0.22.1"
} else {
    $TorchIndex = "https://download.pytorch.org/whl/cu121"; $Torch = "torch==2.5.1"; $TorchVision = "torchvision==0.20.1"
}
Write-Host "    Modelo: LatentSync $Main$(if ($Fallback) { " (reserva: $Fallback)" }) | PyTorch: $Torch ($TorchIndex)"

# 2. ffmpeg + uv -------------------------------------------------------------------------------------
Refresh-Path
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Say "A instalar o ffmpeg"
    Need-Winget
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements | Out-Host
    Refresh-Path
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw "O ffmpeg foi instalado mas nao aparece no PATH. Fecha esta janela e corre o install.bat outra vez." }
}
$FfDir = Split-Path -Parent (Get-Command ffmpeg).Source
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Say "A instalar o uv (gestor de Python)"
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id astral-sh.uv -e --accept-source-agreements --accept-package-agreements | Out-Host
    } else {
        powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
    }
    Refresh-Path
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw "O uv nao ficou disponivel. Fecha esta janela e corre o install.bat outra vez." }
}

# 3. LatentSync code (pinned commit) -----------------------------------------------------------------
if (-not (Test-Path (Join-Path $LsDir "latentsync"))) {
    Say "A descarregar o LatentSync"
    $zip = Join-Path $Root "latentsync.zip"
    Invoke-WebRequest -Uri "https://github.com/bytedance/LatentSync/archive/$LsCommit.zip" -OutFile $zip
    $tmp = Join-Path $Root "_ls_tmp"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp
    $src = Get-ChildItem $tmp | Select-Object -First 1
    if (Test-Path $LsDir) {  # keep downloaded checkpoints from a previous partial install
        if (Test-Path (Join-Path $LsDir "checkpoints")) { Move-Item (Join-Path $LsDir "checkpoints") (Join-Path $src.FullName "checkpoints") -Force }
        Remove-Item -Recurse -Force $LsDir
    }
    Move-Item $src.FullName $LsDir
    Remove-Item -Recurse -Force $tmp, $zip
}

# 4. Microsoft VC++ runtime: onnxruntime 1.21 needs msvcp140.dll 14.40+ (older ones fail with "DLL load failed")
$vc = (Get-Item "$env:WINDIR\System32\msvcp140.dll" -ErrorAction SilentlyContinue).VersionInfo
if (-not $vc -or ([version]"$($vc.FileMajorPart).$($vc.FileMinorPart)" -lt [version]"14.40")) {
    Say "A atualizar o Microsoft Visual C++ Runtime (pode pedir permissao de administrador)"
    Need-Winget
    winget install --id Microsoft.VCRedist.2015+.x64 -e --accept-source-agreements --accept-package-agreements | Out-Host
}

# 5. Python environment ------------------------------------------------------------------------------
Say "A preparar o Python 3.10 e as bibliotecas (demora, sao varios GB)"
uv python install 3.10
if ($LASTEXITCODE -ne 0) { throw "uv python install falhou" }
if (-not (Test-Path $Py)) { uv venv -p 3.10 $Venv; if ($LASTEXITCODE -ne 0) { throw "uv venv falhou" } }

uv pip install --python $Py $Torch $TorchVision --index-url $TorchIndex
if ($LASTEXITCODE -ne 0) { throw "Instalacao do PyTorch falhou" }

# LatentSync's requirements.txt minus gradio (UI not used), insightface (installed below without a compiler)
# and torch (already installed for this GPU). opencv-contrib is pinned too because mediapipe pulls it in.
$reqs = @(
    "diffusers==0.32.2", "transformers==4.48.0", "decord==0.6.0", "accelerate==0.26.1", "einops==0.7.0",
    "omegaconf==2.3.0", "opencv-python==4.9.0.80", "opencv-contrib-python==4.9.0.80", "mediapipe==0.10.11",
    "python_speech_features==0.6", "librosa==0.10.1", "scenedetect==0.6.1", "ffmpeg-python==0.2.0",
    "imageio==2.31.1", "imageio-ffmpeg==0.5.1", "lpips==0.1.4", "face-alignment==1.4.1",
    "huggingface-hub==0.30.2", "numpy==1.26.4", "kornia==0.8.0", "onnxruntime-gpu==1.21.0", "DeepCache==0.1.1",
    # mediapipe 0.10.11 breaks with protobuf 4+; onnx 1.17+ would drag protobuf 4+ in.
    "protobuf==3.20.3", "onnx==1.16.1", "soundfile",
    # ctranslate2 4.5 imports pkg_resources on Windows; setuptools 82+ removed it
    "setuptools==80.9.0",
    # faster-whisper's own deps (it is installed with --no-deps so it cannot pull the CPU onnxruntime)
    "ctranslate2==4.5.0", "av==12.3.0", "tokenizers<0.22,>=0.21", "tqdm"
)
uv pip install --python $Py @reqs
if ($LASTEXITCODE -ne 0) { throw "Instalacao das bibliotecas falhou" }
uv pip install --python $Py --no-deps "faster-whisper==1.1.1"
if ($LASTEXITCODE -ne 0) { throw "Instalacao do faster-whisper falhou" }
& $Py (Join-Path $ToolDir "avatar\patch_insightface.py") $Py
if ($LASTEXITCODE -ne 0) { throw "Instalacao do insightface falhou" }

# 6. Model weights -----------------------------------------------------------------------------------
Say "A descarregar os modelos do LatentSync (5 a 10 GB na primeira vez)"
$dl = @"
import sys
from pathlib import Path
from huggingface_hub import hf_hub_download
ls = Path(sys.argv[1]) / "checkpoints"
main, fallback = sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "")
repo = lambda v: "ByteDance/LatentSync-" + v
hf_hub_download(repo(main), "whisper/tiny.pt", local_dir=ls)
hf_hub_download(repo(main), "latentsync_unet.pt", local_dir=ls)
if fallback:
    hf_hub_download(repo(fallback), "latentsync_unet.pt", local_dir=ls / ("v" + fallback))
print("modelos ok")
"@
$dlFile = Join-Path $Root "_download.py"
Set-Content -Path $dlFile -Value $dl -Encoding ASCII
if ($Fallback) { & $Py $dlFile $LsDir $Main $Fallback } else { & $Py $dlFile $LsDir $Main }
if ($LASTEXITCODE -ne 0) { throw "Download dos modelos falhou (verifica a internet e corre outra vez; o que ja desceu fica guardado)" }
Remove-Item $dlFile

$unetCfg = if ($Main -eq "1.6") { "configs/unet/stage2_512.yaml" } else { "configs/unet/stage2.yaml" }
$cfgArgs = @("latentsync_dir=$LsDir", "latentsync_version=$Main", "unet_config=$unetCfg",
             "checkpoint=checkpoints/latentsync_unet.pt", "ffmpeg_dir=$FfDir", "fp16=$(if ($Fp32) { 'false' } else { 'auto' })")
if ($Fallback) { $cfgArgs += @("fallback_unet_config=configs/unet/stage2.yaml", "fallback_checkpoint=checkpoints/v$Fallback/latentsync_unet.pt") }
& $Py (Join-Path $ToolDir "make_video.py") config @cfgArgs
if ($LASTEXITCODE -ne 0) { throw "Nao consegui gravar a configuracao" }

# 7. Check everything and pre-download the small helper models ---------------------------------------
Say "A verificar tudo"
& $Py (Join-Path $ToolDir "make_video.py") doctor --test
if ($LASTEXITCODE -ne 0) { throw "A verificacao encontrou problemas (ver acima)." }
Say "Instalado. Para criar videos usa o avatar.bat (ver README.md)."
