import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import chat_with_stylist
from services.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

class Message(BaseModel):
   role:    str
   content: str

class ChatRequest(BaseModel):
   message: str
   history: List[Message] = []

@router.post("/chat")
async def chat(data: ChatRequest, user=Depends(get_current_user)):
   rate_limiter.check(user.id, limit=40, window=3600)  # 40 mensagens/hora

   # busca roupas para contexto - continua sem elas se falhar
   try:
      clothes_result = (
         supabase.table("clothes")
         .select("type, color, style, occasion")
         .eq("user_id", user.id)
         .execute()
      )
      clothes = clothes_result.data
   except Exception:
      clothes = []

   history = [{"role": m.role, "content": m.content} for m in data.history]

   try:
      reply = await chat_with_stylist(data.message, history, clothes)
      return {"reply": reply}
   except Exception as e:
      logger.error(f"Erro no chat_with_stylist: {type(e).__name__}: {e}")
      raise HTTPException(
         status_code=503,
         detail="Serviço de IA temporariamente indisponível. Tente em alguns instantes."
      )