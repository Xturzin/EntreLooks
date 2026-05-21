from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import generate_look_ai

router = APIRouter(prefix="/looks", tags=["looks"])

class GenerateLookRequest(BaseModel):
   mode: str = "casual"

@router.post("/generate")
async def generate_look(data: GenerateLookRequest, user=Depends(get_current_user)):
   # busca roupas do usuário
   clothes_result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .limit(30)
      .execute()
   )
   clothes = clothes_result.data

   if len(clothes) < 2:
      raise HTTPException(
         status_code=400,
         detail="Adicione pelo menos 2 peças ao armário para gerar um look"
      )

   # gera look com IA
   try:
      clothes_ids = await generate_look_ai(clothes, data.mode)
   except Exception as e:
      raise HTTPException(status_code=500, detail="Erro ao gerar o look. Tente novamente.")

   if not clothes_ids:
      raise HTTPException(status_code=500, detail="A IA não conseguiu montar um look. Tente novamente.")

   # salva no banco
   look = {
      "user_id":     user.id,
      "clothes_ids": clothes_ids,
      "mode":        data.mode,
      "saved":       False
   }

   result    = supabase.table("looks").insert(look).execute()
   look_data = result.data[0]

   # popula com os dados completos das peças
   clothes_map              = {c["id"]: c for c in clothes}
   look_data["clothes"]     = [clothes_map[id] for id in clothes_ids if id in clothes_map]

   return look_data

@router.patch("/{look_id}/save")
async def save_look(look_id: str, user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .update({"saved": True})
      .eq("id", look_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   return {"saved": True}

@router.get("/")
async def list_saved_looks(user=Depends(get_current_user)):
   looks_result = (
      supabase.table("looks")
      .select("*")
      .eq("user_id", user.id)
      .eq("saved", True)
      .order("created_at", desc=True)
      .execute()
   )
   looks = looks_result.data

   # busca todas as peças de uma vez
   all_ids = list(set(id for look in looks for id in look.get("clothes_ids", [])))

   clothes_map = {}
   if all_ids:
      clothes_result = supabase.table("clothes").select("*").in_("id", all_ids).execute()
      clothes_map    = {c["id"]: c for c in clothes_result.data}

   for look in looks:
      look["clothes"] = [clothes_map[id] for id in look.get("clothes_ids", []) if id in clothes_map]

   return looks