import io
import base64
from PIL import Image

# Lado máximo da imagem que vai pra IA. A Groq redimensiona no servidor dela de qualquer
# jeito, então mandar grande não melhora a leitura nem sai mais caro: medindo o mesmo PNG
# de 256 até 960 de lado, o gasto ficou fixo em 1296 tokens em todas as medições. O que cai
# é o peso do que sobe pela rede, de 1,8 MB pra 533 KB, e isso conta no plano free.
# Testado em 512 e 384 com foto de jaqueta e de tênis: a classificação não piorou. Ficou em
# 512 pra sobrar margem em peça com estampa ou textura fina, que o teste não cobriu.
TAMANHO_PARA_IA = 512

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
   """Normaliza pra PNG mantendo a transparência. Usado quando o recorte já foi
   feito no navegador; o servidor só padroniza o formato e guarda a peça recortada."""
   try:
      img    = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
      output = io.BytesIO()
      img.save(output, format="PNG")
      return output.getvalue()
   except Exception:
      return image_bytes

def flatten_white(image_bytes: bytes) -> bytes:
   """Coloca a peça num fundo branco e encolhe. Serve só pra mandar pra IA identificar,
   porque fundo transparente pode confundir a visão do modelo (às vezes vira preto).

   Só o que vai pra IA passa por aqui. A foto que sobe pro Storage e aparece no app segue
   no tamanho original, sem tocar nesta função."""
   try:
      img        = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
      # thumbnail só reduz, nunca amplia, então foto pequena passa batido
      img.thumbnail((TAMANHO_PARA_IA, TAMANHO_PARA_IA), Image.LANCZOS)
      background = Image.new("RGBA", img.size, (255, 255, 255, 255))
      background.paste(img, mask=img.split()[3])
      output = io.BytesIO()
      background.convert("RGB").save(output, format="PNG")
      return output.getvalue()
   except Exception:
      return image_bytes

def to_base64(image_bytes: bytes) -> str:
   return base64.b64encode(image_bytes).decode("utf-8")