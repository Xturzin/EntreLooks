import uuid
import time
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from dependencies import get_current_user
from services.image_service import to_png, flatten_white, to_base64
from services.openai_service import categorize_clothing
from services.supabase_service import supabase
from services.rate_limiter import rate_limiter

router = APIRouter(prefix="/clothes", tags=["clothes"])

# Rotas que so conversam com o Supabase sao "def" comum, e nao "async def", de proposito.
# O cliente do supabase-py e sincrono: chamado de dentro de uma rota async, ele trava o
# event loop inteiro enquanto espera a resposta, e as requisicoes passam a esperar uma pela
# outra (medido em producao: 8 simultaneas custavam 4,3 vezes o tempo de uma). Declarando a
# rota como def, o FastAPI roda ela numa threadpool e elas voltam a correr em paralelo.
# As rotas que dao await em alguma coisa (IA, leitura de upload, outra corrotina) continuam
# async, porque await so existe dentro de funcao async.
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Quanto tempo o navegador pode guardar a imagem de uma peça sem perguntar de novo.
#
# Sem isso o Storage devolve "no-cache", e aí toda reabertura do app rebaixa o armário
# inteiro: medido, 19 peças davam 4,34 MB e 9,4 segundos em TODA abertura, sem nem um 304.
#
# Um ano é seguro porque o caminho do arquivo carrega o id da peça, então conteúdo novo
# nunca reusa caminho antigo. A única exceção é a troca de foto, que sobrescreve o mesmo
# caminho de propósito, e ela já resolve isso acrescentando ?v=<timestamp> na URL.
#
# Atenção ao formato: o Supabase PREFIXA "public, max-age=" no valor que recebe. Passar o
# cabeçalho inteiro aqui gera "public, max-age=public, max-age=31536000", que não vale
# nada. Vai só o número de segundos.
CACHE_DA_IMAGEM = "31536000"  # um ano


# campos que o usuário pode corrigir quando a IA erra a classificação da peça
class ClothUpdate(BaseModel):
   type:     Optional[str] = None
   color:    Optional[str] = None
   style:    Optional[str] = None
   occasion: Optional[str] = None
   nickname: Optional[str] = None

@router.post("/")
async def upload_clothing(
   file: UploadFile = File(...),
   user=Depends(get_current_user)
):
   # 30 e não 20 porque montar o armário é uma sessão só: com 20 a pessoa era obrigada a
   # parar no meio do cadastro e voltar uma hora depois.
   rate_limiter.check("imagem", user.id, limit=30, window=3600)  # 30 imagens/hora

   if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"):
      raise HTTPException(status_code=400, detail="Formato inválido. Use JPG, PNG ou WEBP.")

   image_bytes = await file.read()

   if len(image_bytes) > MAX_FILE_SIZE:
      raise HTTPException(status_code=400, detail="Imagem muito grande. Máximo 10MB.")

   # O servidor só normaliza o formato. O recorte de fundo acontece no navegador, e quando
   # ele não dá conta a foto entra com fundo mesmo: recortar aqui derrubava a instância
   # inteira (ver o comentário no image_service).
   #
   # O parâmetro bg_removed que existia aqui saiu junto. Ele só servia pra escolher entre
   # normalizar e recortar, e agora o caminho é um só. Frontend antigo que ainda mande o
   # campo não quebra: o FastAPI ignora campo de formulário que a rota não declara.
   processed = to_png(image_bytes)

   # categoriza com IA usando a peça em fundo branco (transparência atrapalha a visão)
   try:
      categories = await categorize_clothing(to_base64(flatten_white(processed)))
   except Exception as e:
      import logging
      logging.getLogger("entrelooks").warning(f"Categorização falhou: {type(e).__name__}: {e}")
      categories = {"type": None, "color": None, "style": None, "occasion": None}

   # upload para o Supabase Storage
   cloth_id     = str(uuid.uuid4())
   storage_path = f"{user.id}/{cloth_id}.png"

   try:
      supabase.storage.from_("clothes").upload(
         storage_path,
         processed,
         {"content-type": "image/png", "cache-control": CACHE_DA_IMAGEM}
      )
   except Exception as e:
      raise HTTPException(status_code=500, detail=f"Erro no upload da imagem: {str(e)}")

   image_url = supabase.storage.from_("clothes").get_public_url(storage_path)

   # salva no banco. A IA às vezes devolve alguma chave extra que não existe como
   # coluna, e isso derrubaria o insert inteiro, então copiamos só os quatro campos
   # que a tabela conhece. O que não veio fica None, igual ao caminho de erro acima.
   cloth = {
      "id":        cloth_id,
      "user_id":   user.id,
      "image_url": image_url,
      "type":      categories.get("type"),
      "color":     categories.get("color"),
      "style":     categories.get("style"),
      "occasion":  categories.get("occasion")
   }

   result = supabase.table("clothes").insert(cloth).execute()
   return result.data[0]

@router.get("/stats")
def wardrobe_stats(user=Depends(get_current_user)):
   result = (
      supabase.table("clothes")
      .select("id, type, color, image_url, wear_count, last_worn_at")
      .eq("user_id", user.id)
      .execute()
   )
   clothes = result.data

   if not clothes:
      return {
         "total":            0,
         "most_worn":        [],
         "never_worn":       [],
         "never_worn_count": 0
      }

   never_worn  = [c for c in clothes if not c.get("wear_count")]
   used        = [c for c in clothes if c.get("wear_count")]
   most_worn   = sorted(used, key=lambda c: c["wear_count"], reverse=True)[:4]

   return {
      "total":            len(clothes),
      "most_worn":        most_worn,
      "never_worn":       never_worn[:4],
      "never_worn_count": len(never_worn)
   }

@router.delete("/{cloth_id}")
def delete_clothing(cloth_id: str, user=Depends(get_current_user)):
   # Antes daqui havia um select só pra devolver 404 quando a peça não era da pessoa. Ele
   # era uma ida ao Supabase inteira (medido: 1483ms na rota, três idas em sequência, e a
   # distância Render para São Paulo é o que custa). O próprio delete já filtra por user_id
   # e devolve as linhas que apagou, então dá pra decidir o 404 com o retorno dele.
   apagadas = (
      supabase.table("clothes")
      .delete()
      .eq("id", cloth_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not apagadas.data:
      raise HTTPException(status_code=404, detail="Peça não encontrada")

   # O caminho no Storage nunca veio do select: ele é montado a partir do id de quem está
   # logado e do id da peça, a mesma convenção que o upload e a troca de foto usam. Por isso
   # tirar o select não deixa a imagem órfã.
   #
   # A remoção vem depois do delete de propósito: se a peça não era da pessoa, a rota já saiu
   # com 404 acima e nem chega a encostar no arquivo. Falha aqui não desfaz o delete, porque
   # peça sem imagem é um estado bem melhor do que imagem sem peça.
   try:
      supabase.storage.from_("clothes").remove([f"{user.id}/{cloth_id}.png"])
   except Exception:
      pass

   return {"deleted": True}

@router.patch("/{cloth_id}")
def update_clothing(
   cloth_id: str,
   data: ClothUpdate,
   user=Depends(get_current_user)
):
   # só atualiza o que veio preenchido, pra não apagar campo sem querer
   updates = {k: v for k, v in data.model_dump().items() if v is not None}

   if not updates:
      raise HTTPException(status_code=400, detail="Nada para atualizar")

   result = (
      supabase.table("clothes")
      .update(updates)
      .eq("id", cloth_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Peça não encontrada")

   return result.data[0]

@router.get("/")
def list_clothes(
   user=Depends(get_current_user),
   limit: int = 50,
   offset: int = 0
):
   result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", desc=True)
      .range(offset, offset + limit - 1)
      .execute()
   )
   return result.data

@router.post("/{cloth_id}/photo")
async def replace_photo(
   cloth_id: str,
   file: UploadFile = File(...),
   user=Depends(get_current_user)
):
   """Troca só a foto de uma peça já cadastrada, mantendo o resto (id, categoria,
   presença nos looks). Serve pra consertar um recorte ruim ou modernizar peça antiga."""
   # mesmo balde do upload, e por isso o mesmo teto: subir peça nova e trocar foto custam
   # o mesmo trabalho, e um número menor aqui viraria o limite real do balde inteiro
   rate_limiter.check("imagem", user.id, limit=30, window=3600)

   existing = (
      supabase.table("clothes")
      .select("id")
      .eq("id", cloth_id)
      .eq("user_id", user.id)
      .execute()
   )
   if not existing.data:
      raise HTTPException(status_code=404, detail="Peça não encontrada")

   if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"):
      raise HTTPException(status_code=400, detail="Formato inválido. Use JPG, PNG ou WEBP.")

   image_bytes = await file.read()
   if len(image_bytes) > MAX_FILE_SIZE:
      raise HTTPException(status_code=400, detail="Imagem muito grande. Máximo 10MB.")

   # mesma coisa do upload: aqui só normaliza o formato
   processed    = to_png(image_bytes)
   storage_path = f"{user.id}/{cloth_id}.png"

   # sobrescreve o arquivo no mesmo caminho (upsert)
   try:
      supabase.storage.from_("clothes").upload(
         storage_path,
         processed,
         {"content-type": "image/png", "upsert": "true",
          "cache-control": CACHE_DA_IMAGEM}
      )
   except Exception as e:
      raise HTTPException(status_code=500, detail=f"Erro ao trocar a imagem: {str(e)}")

   # o link do arquivo é o mesmo; o ?v no fim força o navegador a pegar a versão nova
   base_url  = supabase.storage.from_("clothes").get_public_url(storage_path)
   separator = "&" if "?" in base_url else "?"
   image_url = f"{base_url}{separator}v={int(time.time())}"

   result = (
      supabase.table("clothes")
      .update({"image_url": image_url})
      .eq("id", cloth_id)
      .eq("user_id", user.id)
      .execute()
   )
   return result.data[0]