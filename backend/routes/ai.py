from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import chat_with_stylist

router = APIRouter(prefix="/ai", tags=["ai"])

class Message(BaseModel):
   role:    str
   content: str

class ChatRequest(BaseModel):
   message: str
   history: List[Message] = []

@router.post("/chat")
async def chat(data: ChatRequest, user=Depends(get_current_user)):
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
   except Exception:
      raise HTTPException(status_code=500, detail="Erro ao processar resposta da IA. Tente novamente.")

   return {"reply": reply}