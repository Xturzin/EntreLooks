from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import generate_look_ai
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/looks", tags=["looks"])

class GenerateLookRequest(BaseModel):
   mode:    str            = "casual"
   weather: Optional[dict] = None

@router.post("/generate")
async def generate_look(data: GenerateLookRequest, user=Depends(get_current_user)):
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

   # busca contexto de rejeições para aprendizado
   rejected_context = await _get_rejection_context(user.id)

   try:
      clothes_ids = await generate_look_ai(clothes, data.mode, data.weather, rejected_context)
   except Exception:
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

async def _get_rejection_context(user_id: str) -> list:
   try:
      rejections = (
         supabase.table("look_interactions")
         .select("look_id")
         .eq("user_id", user_id)
         .eq("action", "rejected")
         .order("created_at", desc=True)
         .limit(8)
         .execute()
      )

      if not rejections.data:
         return []

      rejected_ids = [r["look_id"] for r in rejections.data]

      rejected_looks = (
         supabase.table("looks")
         .select("clothes_ids")
         .in_("id", rejected_ids)
         .execute()
      )

      all_cloth_ids = list({
         cid
         for look in rejected_looks.data
         for cid in look.get("clothes_ids", [])
      })

      if not all_cloth_ids:
         return []

      rejected_clothes = (
         supabase.table("clothes")
         .select("type, color, style")
         .in_("id", all_cloth_ids[:20])
         .execute()
      )

      return rejected_clothes.data

   except Exception:
      return []

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

   clothes_ids = result.data[0].get("clothes_ids", [])
   await _track_wear(clothes_ids, user.id)

   try:
      supabase.table("look_interactions").insert({
         "user_id": user.id,
         "look_id": look_id,
         "action":  "accepted"
      }).execute()
   except Exception:
      pass

   return {"saved": True}

@router.post("/{look_id}/reject")
async def reject_look(look_id: str, user=Depends(get_current_user)):
   try:
      existing = (
         supabase.table("look_interactions")
         .select("id")
         .eq("user_id", user.id)
         .eq("look_id", look_id)
         .eq("action", "rejected")
         .limit(1)
         .execute()
      )

      if not existing.data:
         supabase.table("look_interactions").insert({
            "user_id": user.id,
            "look_id": look_id,
            "action":  "rejected"
         }).execute()

   except Exception:
      pass

   return {"rejected": True}

async def _track_wear(clothes_ids: list, user_id: str):
   if not clothes_ids:
      return

   now = datetime.now(timezone.utc).isoformat()

   try:
      worn = (
         supabase.table("clothes")
         .select("id, wear_count")
         .in_("id", clothes_ids)
         .eq("user_id", user_id)
         .execute()
      )

      for cloth in worn.data:
         new_count = (cloth.get("wear_count") or 0) + 1
         supabase.table("clothes").update({
            "wear_count":   new_count,
            "last_worn_at": now
         }).eq("id", cloth["id"]).execute()

   except Exception:
      pass  # não bloqueia o salvamento do look se falhar

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