"""Install insightface 0.7.3 on Windows without Visual Studio.

PyPI only ships insightface as source with a C++ extension, which needs a compiler.
That extension only backs the 3D mask renderer; LatentSync uses FaceAnalysis detection and
106-point landmarks, which are pure Python on top of onnxruntime. So we build a pure-Python
package from the official sdist (hash-checked) with the extension removed.

Usage: python patch_insightface.py <python-exe-of-target-venv>
"""

import hashlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

URL = "https://files.pythonhosted.org/packages/0b/8d/0f4af90999ca96cf8cb846eb5ae27c5ef5b390f9c090dd19e4fa76364c13/insightface-0.7.3.tar.gz"
SHA256 = "f191f719612ebb37018f41936814500544cd0f86e6fcd676c023f354c668ddf7"

PYPROJECT = """[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"

[project]
name = "insightface"
version = "0.7.3"
requires-python = ">=3.8"
dependencies = [
  "numpy", "onnx==1.16.2", "tqdm", "requests", "matplotlib", "Pillow", "scipy",
  "scikit-learn", "scikit-image", "easydict", "prettytable",
]

[tool.setuptools.packages.find]
include = ["insightface*"]

[tool.setuptools.package-data]
"*" = ["*.jpg", "*.png", "*.pkl", "*.npy", "*.txt"]
"""


def build(dest: Path) -> Path:
    tgz = dest / "insightface-0.7.3.tar.gz"
    urllib.request.urlretrieve(URL, tgz)
    digest = hashlib.sha256(tgz.read_bytes()).hexdigest()
    if digest != SHA256:
        raise SystemExit(f"insightface sdist hash mismatch: {digest}")
    with tarfile.open(tgz) as tf:
        tf.extractall(dest)
    src = dest / "insightface-0.7.3"
    for f in ("setup.py", "setup.cfg"):
        (src / f).unlink(missing_ok=True)
    shutil.rmtree(src / "insightface.egg-info", ignore_errors=True)
    (src / "pyproject.toml").write_text(PYPROJECT, encoding="utf-8")
    init = src / "insightface" / "app" / "__init__.py"
    init.write_text(
        "from .face_analysis import *\n"
        "try:  # needs the compiled face3d extension, not used for detection/landmarks\n"
        "    from .mask_renderer import *\n"
        "except ImportError:\n"
        "    pass\n",
        encoding="utf-8",
    )
    return src


def main():
    py = sys.argv[1] if len(sys.argv) > 1 else sys.executable
    with tempfile.TemporaryDirectory() as tmp:
        src = build(Path(tmp))
        uv = shutil.which("uv")
        cmd = [uv, "pip", "install", "--python", py, str(src)] if uv else [py, "-m", "pip", "install", str(src)]
        subprocess.run(cmd, check=True)
    print("insightface 0.7.3 instalado (sem extensão C++)")


if __name__ == "__main__":
    main()
