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

def _to_png(image_bytes: bytes) -> bytes:
   """Converte qualquer formato suportado pelo Pillow para PNG RGB."""
   img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
   output = io.BytesIO()
   img.save(output, format="PNG")
   return output.getvalue()

def remove_background(image_bytes: bytes) -> bytes:
   session = _get_session()

   try:
      if session is not None:
         from rembg import remove as rembg_remove
         result     = rembg_remove(image_bytes, session=session)
         img_rgba   = Image.open(io.BytesIO(result)).convert("RGBA")
         background = Image.new("RGBA", img_rgba.size, (255, 255, 255, 255))
         background.paste(img_rgba, mask=img_rgba.split()[3])
         output = io.BytesIO()
         background.convert("RGB").save(output, format="PNG")
         return output.getvalue()
      else:
         # rembg indisponível: só normaliza para PNG
         return _to_png(image_bytes)

   except Exception:
      # último recurso: tenta normalizar; se falhar, retorna original
      try:
         return _to_png(image_bytes)
      except Exception:
         return image_bytes

def to_png(image_bytes: bytes) -> bytes:
   """Só garante que a imagem está em PNG, sem tirar fundo. Usado quando o recorte
   já foi feito no navegador do usuário e o servidor só precisa normalizar e guardar."""
   try:
      return _to_png(image_bytes)
   except Exception:
      return image_bytes

def to_base64(image_bytes: bytes) -> str:
   return base64.b64encode(image_bytes).decode("utf-8")