import base64
import io
from PIL import Image

try:
   from rembg import remove as rembg_remove
   REMBG_AVAILABLE = True
except Exception:
   REMBG_AVAILABLE = False

def remove_background(image_bytes: bytes) -> bytes:
   if not REMBG_AVAILABLE:
      return image_bytes
   try:
      result = rembg_remove(image_bytes)
      # converte para PNG com fundo branco
      img = Image.open(io.BytesIO(result)).convert("RGBA")
      background = Image.new("RGBA", img.size, (255, 255, 255, 255))
      background.paste(img, mask=img.split()[3])
      output = io.BytesIO()
      background.convert("RGB").save(output, format="PNG")
      return output.getvalue()
   except Exception:
      return image_bytes

def to_base64(image_bytes: bytes) -> str:
   return base64.b64encode(image_bytes).decode("utf-8")