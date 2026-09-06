import asyncio
import logging
from collections import Counter
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import chat_with_stylist
from services.look_service import encontrar_look_citado, separar_linha_look
from services.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

class Message(BaseModel):
   role:    str
   content: str

class ChatRequest(BaseModel):
   message: str
   history: List[Message]  = []
   weather: Optional[dict] = None

def _pieces_names(clothes_map: dict, ids: list) -> list:
   """Transforma ids de peça em nomes legíveis ("camiseta branca") pro prompt."""
   nomes = []
   for cid in ids:
      c = clothes_map.get(cid)
      if c:
         nome = f"{c.get('type', '')} {c.get('color', '')}".strip()
         if nome:
            nomes.append(nome)
   return nomes

async def _get_planned_context(user_id: str) -> list:
   """O que a pessoa já deixou planejado pros próximos dias."""
   try:
      planned = (
         supabase.table("planned_looks")
         .select("date, look_id")
         .eq("user_id", user_id)
         .gte("date", date.today().isoformat())
         .order("date")
         .limit(7)
         .execute()
      )
      if not planned.data:
         return []

      look_ids  = [p["look_id"] for p in planned.data]
      looks_res = supabase.table("looks").select("id, mode, clothes_ids").in_("id", look_ids).execute()
      looks_map = {l["id"]: l for l in looks_res.data}

      all_ids = list({cid for l in looks_res.data for cid in l.get("clothes_ids", [])})
      if not all_ids:
         return []

      cres        = supabase.table("clothes").select("id, type, color").in_("id", all_ids).execute()
      clothes_map = {c["id"]: c for c in cres.data}

      resultado = []
      for p in planned.data:
         look = looks_map.get(p["look_id"])
         if not look:
            continue
         resultado.append({
            "date":   p["date"],
            "mode":   look.get("mode", "casual"),
            "pieces": _pieces_names(clothes_map, look.get("clothes_ids", []))
         })
      return resultado

   except Exception:
      return []

async def _get_key_pieces(user_id: str) -> dict:
   """Peças que mais aparecem nos looks salvos de cada ocasião. São as âncoras dela."""
   try:
      looks = (
         supabase.table("looks")
         .select("mode, clothes_ids")
         .eq("user_id", user_id)
         .eq("saved", True)
         .limit(50)
         .execute()
      )
      if not looks.data:
         return {}

      por_modo = {}
      all_ids  = set()
      for look in looks.data:
         modo = look.get("mode") or "casual"
         por_modo.setdefault(modo, Counter())
         for cid in look.get("clothes_ids", []):
            por_modo[modo][cid] += 1
            all_ids.add(cid)

      if not all_ids:
         return {}

      cres        = supabase.table("clothes").select("id, type, color").in_("id", list(all_ids)).execute()
      clothes_map = {c["id"]: c for c in cres.data}

      resultado = {}
      for modo, contagem in por_modo.items():
         mais_usadas = [cid for cid, _ in contagem.most_common(4)]
         nomes       = _pieces_names(clothes_map, mais_usadas)
         if nomes:
            resultado[modo] = nomes
      return resultado

   except Exception:
      return {}

def _sugestao_de_look(reply: str, clothes: list) -> tuple:
   """Devolve (resposta_pra_mostrar, extras) onde extras traz o campo "sugestao" quando a
   Mira sugeriu um look montável, ou vem vazio quando não sugeriu.

   O try é estreito de propósito: ele cobre só o casamento, e não a conversa. A resposta da
   Mira já está pronta e é o que a pessoa veio buscar, então um erro aqui pode custar a
   miniatura, nunca a mensagem.
   """
   try:
      linha, sem_linha = separar_linha_look(reply)
      pecas = encontrar_look_citado(linha, clothes) if linha else []
   except Exception as e:
      logger.warning(f"Falha ao casar peças da sugestão: {type(e).__name__}: {e}")
      return reply, {}

   if not pecas:
      # Sem peças casadas a linha continua no texto: ela é legível e vale mais como
      # resumo do que sumindo sem deixar nada no lugar.
      return reply, {}

   # Casou, então as miniaturas substituem a lista escrita e ela sai do texto.
   return sem_linha, {
      "sugestao": {
         "clothes_ids": [p["id"] for p in pecas],
         # só o que a bolha precisa desenhar, em vez da linha inteira do banco
         "clothes": [
            {
               "id":        p["id"],
               "type":      p.get("type"),
               "color":     p.get("color"),
               "image_url": p.get("image_url"),
            }
            for p in pecas
         ],
      }
   }

@router.post("/chat")
async def chat(data: ChatRequest, user=Depends(get_current_user)):
   rate_limiter.check("chat", user.id, limit=40, window=3600)  # 40 mensagens/hora

   # busca roupas para contexto - continua sem elas se falhar
   try:
      clothes_result = (
         supabase.table("clothes")
         .select("id, type, color, style, occasion, image_url, wear_count")
         .eq("user_id", user.id)
         .execute()
      )
      clothes = clothes_result.data
   except Exception:
      clothes = []

   history = [{"role": m.role, "content": m.content} for m in data.history]

   # nome que a pessoa escolheu no onboarding, pra Mira chamar pelo nome
   meta = getattr(user, "user_metadata", None) or {}
   name = meta.get("name")

   # contexto que deixa a Mira esperta: o que está planejado e as peças-chave dela.
   # se algo falhar, os helpers devolvem vazio e a conversa segue normal.
   planned, key_pieces = await asyncio.gather(
      _get_planned_context(user.id),
      _get_key_pieces(user.id)
   )

   try:
      reply = await chat_with_stylist(
         data.message, history, clothes, name, data.weather, planned, key_pieces
      )
      texto, extras = _sugestao_de_look(reply, clothes)
      return {"reply": texto, **extras}
   except Exception as e:
      logger.error(f"Erro no chat_with_stylist: {type(e).__name__}: {e}")
      raise HTTPException(
         status_code=503,
         detail="Serviço de IA temporariamente indisponível. Tente em alguns instantes."
      )