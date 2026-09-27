"""Regenera etiqueta.js a partir de etiqueta-guepardex.png.

La etiqueta se guarda como WebP *sin pérdida* (idéntica píxel a píxel al PNG) en un
data URI. Así la animación funciona igual abriendo index.html con doble clic que
publicada en GitHub Pages. Solo hace falta ejecutarlo si cambias la etiqueta:

    python build.py
"""
import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
LABEL = HERE / "etiqueta-guepardex.png"
OUT = HERE / "etiqueta.js"

original = Image.open(LABEL).convert("RGB")
buf = io.BytesIO()
original.save(buf, "WEBP", lossless=True, quality=100, method=6)

decoded = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
assert np.array_equal(np.asarray(decoded), np.asarray(original)), "La etiqueta no es idéntica"

data_uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
OUT.write_text(
    "// Generado por build.py a partir de etiqueta-guepardex.png. No editar a mano.\n"
    "// Etiqueta de Guepardex en WebP sin pérdida (idéntica píxel a píxel al PNG original).\n"
    f"window.GUEPARDEX_ETIQUETA = '{data_uri}';\n",
    encoding="utf-8",
    newline="\n",
)
print(f"{OUT.name}: {OUT.stat().st_size / 1024:.0f} KB (etiqueta {original.width}x{original.height}, sin pérdida)")
