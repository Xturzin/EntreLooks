from fastapi import APIRouter, Depends
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
   clothes_result = (
      supabase.table("clothes")
      .select("type, color, style, occasion")
      .eq("user_id", user.id)
      .execute()
   )

   history = [{"role": m.role, "content": m.content} for m in data.history]
   reply   = await chat_with_stylist(data.message, history, clothes_result.data)

   return {"reply": reply}