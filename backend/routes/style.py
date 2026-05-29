from fastapi import APIRouter, Depends
from dependencies import get_current_user
from services.supabase_service import supabase
from services.style_service import analyze_wardrobe
from services.openai_service import generate_style_summary
from services.rate_limiter import rate_limiter

router = APIRouter(prefix="/style", tags=["style"])

@router.get("/")
async def get_style_profile(user=Depends(get_current_user)):
   # busca roupas
   clothes_result = supabase.table("clothes").select("*").eq("user_id", user.id).execute()
   clothes        = clothes_result.data

   # análise local
   stats = analyze_wardrobe(clothes)

   # busca resumo salvo
   profile_result = (
      supabase.table("user_style_profile")
      .select("style_summary")
      .eq("user_id", user.id)
      .execute()
   )

   summary = None
   if profile_result.data:
      summary = profile_result.data[0].get("style_summary")

   return {**stats, "summary": summary}

@router.post("/generate")
async def generate_profile(user=Depends(get_current_user)):
   rate_limiter.check(user.id, limit=5, window=3600)  # 5 análises/hora

   clothes_result = supabase.table("clothes").select("*").eq("user_id", user.id).execute()
   clothes        = clothes_result.data

   stats = analyze_wardrobe(clothes)

   try:
      summary = await generate_style_summary(stats, clothes)
   except Exception:
      raise HTTPException(
         status_code=503,
         detail="Serviço de IA temporariamente indisponível. Tente em alguns instantes."
      )

   # salva ou atualiza na tabela
   existing = (
      supabase.table("user_style_profile")
      .select("user_id")
      .eq("user_id", user.id)
      .execute()
   )

   if existing.data:
      supabase.table("user_style_profile").update({
         "style_summary": summary,
         "dominant_colors": [c["name"] for c in stats["dominant_colors"]],
         "style_tags":      [s["name"] for s in stats["top_styles"]],
      }).eq("user_id", user.id).execute()
   else:
      supabase.table("user_style_profile").insert({
         "user_id":         user.id,
         "style_summary":   summary,
         "dominant_colors": [c["name"] for c in stats["dominant_colors"]],
         "style_tags":      [s["name"] for s in stats["top_styles"]],
      }).execute()

   return {**stats, "summary": summary}