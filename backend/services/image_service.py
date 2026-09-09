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

# O recorte de fundo NÃO acontece mais aqui. Ele era feito com rembg e o modelo u2netp, e
# saiu depois de medido: no plano free do Render uma foto levava 61,9 segundos e terminava
# em HTTP 502, deixando a instância respondendo 503 por um tempo. Ou seja, o upload de uma
# pessoa derrubava o app de todo mundo. A mesma inferência roda em 0,49s numa máquina comum,
# então o problema não é o modelo, é a fração de CPU do plano free.
#
# Agora, quando o navegador não consegue recortar, a foto entra como está, com fundo. A peça
# fica no armário e a pessoa arruma depois pelo "Trocar foto", que já existe. É melhor que
# recusar o upload por uma limitação de infra que não é problema dela.
#
# Tirar o rembg levou junto o onnxruntime, que era o que prendia o projeto no Python 3.12.

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