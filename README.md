# Lata 3D de Guepardex

Lata 3D de Guepardex sobre fondo blanco. Flota suavemente y gira sobre su eje al pasar el cursor. Pensada para insertarse en Notion con un bloque **Embed**.

## Archivos

| Archivo | Función |
| --- | --- |
| `index.html` | Página: fondo blanco y lienzo a pantalla completa. |
| `lata.js` | Animación (WebGL2, sin librerías): modelo de la lata, iluminación, flotación y giro al pasar el cursor. |
| `etiqueta.js` | Etiqueta incrustada como WebP sin pérdida. Se genera con `build.py`. |
| `etiqueta-guepardex.png` | Etiqueta original. No se carga en la página; es la fuente de `etiqueta.js`. |
| `build.py` | Regenera `etiqueta.js` si cambias la etiqueta (`python build.py`). |

Para que la animación funcione solo hacen falta `index.html`, `lata.js` y `etiqueta.js`, siempre juntos en la misma carpeta.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio de GitHub.
2. En el repositorio, entra en **Settings → Pages**. En **Source** elige *Deploy from a branch*, luego la rama `main` y la carpeta `/ (root)`.
3. Tras un minuto la página estará disponible en `https://<usuario>.github.io/<repositorio>/`.
4. En Notion, escribe `/embed`, pega esa URL y ajusta el alto del bloque.

Si subes la carpeta completa en vez de su contenido, la URL termina en `/<repositorio>/guepardex-lata-3d/`.
