import io
import base64
from PIL import Image

# session carregada sob demanda, nunca no import
_rembg_session = None

def _get_session():
   global _rembg_session

   if _rembg_session is False:
      return None

   if _rembg_session is None:
      try:
         from rembg import new_session
         # u2netp é o modelo leve (~4MB vs 168MB do u2net)
         _rembg_session = new_session("u2netp")
      except Exception:
         _rembg_session = False
         return None

   return _rembg_session

def remove_background(image_bytes: bytes) -> bytes:
   session = _get_session()

   if session is None:
      return image_bytes

   try:
      from rembg import remove as rembg_remove

      result = rembg_remove(image_bytes, session=session)

      # converte para PNG com fundo branco
      img        = Image.open(io.BytesIO(result)).convert("RGBA")
      background = Image.new("RGBA", img.size, (255, 255, 255, 255))
      background.paste(img, mask=img.split()[3])

      output = io.BytesIO()
      background.convert("RGB").save(output, format="PNG")
      return output.getvalue()

   except Exception:
      return image_bytes

def to_base64(image_bytes: bytes) -> str:
   return base64.b64encode(image_bytes).decode("utf-8")