import asyncio
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import generate_look_ai
from services.rate_limiter import rate_limiter

router = APIRouter(prefix="/looks", tags=["looks"])

class GenerateLookRequest(BaseModel):
   mode:    str            = "casual"
   weather: Optional[dict] = None

class PlanRequest(BaseModel):
   look_id: str
   date:    str   # formato YYYY-MM-DD

class CreateLookRequest(BaseModel):
   clothes_ids: List[str]
   mode:        str = "casual"

@router.get("/count")
async def count_saved_looks(user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .select("id", count="exact")
      .eq("user_id", user.id)
      .eq("saved", True)
      .execute()
   )
   return {"count": result.count or 0}

@router.post("/generate")
async def generate_look(data: GenerateLookRequest, user=Depends(get_current_user)):
   rate_limiter.check(user.id, limit=15, window=3600)  # 15 looks/hora

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

   # busca contexto de rejeições e de aceitações para aprendizado
   rejected_context, positive_context = await asyncio.gather(
      _get_rejection_context(user.id),
      _get_positive_context(user.id)
   )

   try:
      clothes_ids = await generate_look_ai(clothes, data.mode, data.weather, rejected_context, positive_context)
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

@router.post("/manual")
async def create_manual_look(data: CreateLookRequest, user=Depends(get_current_user)):
   if len(data.clothes_ids) < 2:
      raise HTTPException(
         status_code=400,
         detail="Selecione pelo menos 2 peças para montar um look"
      )

   # valida que as peças existem e pertencem ao usuário
   clothes_result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .in_("id", data.clothes_ids)
      .execute()
   )
   clothes     = clothes_result.data
   clothes_map = {c["id"]: c for c in clothes}

   # preserva a ordem escolhida pelo usuário, descartando ids inválidos
   ordered_ids = [cid for cid in data.clothes_ids if cid in clothes_map]

   if len(ordered_ids) < 2:
      raise HTTPException(
         status_code=400,
         detail="Selecione pelo menos 2 peças válidas do seu armário"
      )

   look = {
      "user_id":     user.id,
      "clothes_ids": ordered_ids,
      "mode":        data.mode,
      "saved":       True
   }

   result    = supabase.table("looks").insert(look).execute()
   look_data = result.data[0]

   await _track_wear(ordered_ids, user.id)

   look_data["clothes"] = [clothes_map[id] for id in ordered_ids]

   return look_data

async def _get_positive_context(user_id: str) -> list:
   try:
      saved = (
         supabase.table("looks")
         .select("clothes_ids")
         .eq("user_id", user_id)
         .eq("saved", True)
         .order("created_at", desc=True)
         .limit(5)
         .execute()
      )

      if not saved.data:
         return []

      all_cloth_ids = list({
         cid
         for look in saved.data
         for cid in look.get("clothes_ids", [])
      })

      if not all_cloth_ids:
         return []

      positive_clothes = (
         supabase.table("clothes")
         .select("type, color, style")
         .in_("id", all_cloth_ids[:20])
         .execute()
      )

      return positive_clothes.data

   except Exception:
      return []

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

@router.delete("/{look_id}")
async def delete_look(look_id: str, user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .select("id")
      .eq("id", look_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   supabase.table("looks").delete().eq("id", look_id).eq("user_id", user.id).execute()

   return {"deleted": True}

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
async def list_saved_looks(
   user=Depends(get_current_user),
   limit: int = 20,
   offset: int = 0
):
   looks_result = (
      supabase.table("looks")
      .select("*")
      .eq("user_id", user.id)
      .eq("saved", True)
      .order("created_at", desc=True)
      .range(offset, offset + limit - 1)
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

@router.post("/plan")
async def plan_look(data: PlanRequest, user=Depends(get_current_user)):
   # confere que o look é do próprio usuário antes de agendar
   look = (
      supabase.table("looks")
      .select("id")
      .eq("id", data.look_id)
      .eq("user_id", user.id)
      .execute()
   )
   if not look.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   # um look por dia: se já tinha algo agendado nessa data, substitui
   row = {"user_id": user.id, "look_id": data.look_id, "date": data.date}
   result = supabase.table("planned_looks").upsert(row, on_conflict="user_id,date").execute()
   return result.data[0]

@router.get("/planned")
async def list_planned(user=Depends(get_current_user)):
   planned = (
      supabase.table("planned_looks")
      .select("*")
      .eq("user_id", user.id)
      .order("date")
      .execute()
   )
   rows = planned.data

   if not rows:
      return []

   # busca os looks agendados e popula com as peças, de uma vez só
   look_ids  = list({r["look_id"] for r in rows})
   looks_res = supabase.table("looks").select("*").in_("id", look_ids).execute()

   clothes_ids = list({cid for lk in looks_res.data for cid in lk.get("clothes_ids", [])})
   clothes_map = {}
   if clothes_ids:
      cres        = supabase.table("clothes").select("*").in_("id", clothes_ids).execute()
      clothes_map = {c["id"]: c for c in cres.data}

   for lk in looks_res.data:
      lk["clothes"] = [clothes_map[i] for i in lk.get("clothes_ids", []) if i in clothes_map]

   looks_map = {lk["id"]: lk for lk in looks_res.data}
   for r in rows:
      r["look"] = looks_map.get(r["look_id"])

   return rows

@router.delete("/planned/{plan_id}")
async def delete_planned(plan_id: str, user=Depends(get_current_user)):
   supabase.table("planned_looks").delete().eq("id", plan_id).eq("user_id", user.id).execute()
   return {"deleted": True}