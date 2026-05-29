import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from dependencies import get_current_user
from services.image_service import remove_background, to_base64
from services.openai_service import categorize_clothing
from services.supabase_service import supabase
from services.rate_limiter import rate_limiter

router = APIRouter(prefix="/clothes", tags=["clothes"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/")
async def upload_clothing(
   file: UploadFile = File(...),
   user=Depends(get_current_user)
):
   rate_limiter.check(user.id, limit=20, window=3600)  # 20 uploads/hora

   if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/heic"):
      raise HTTPException(status_code=400, detail="Formato inválido. Use JPG, PNG ou WEBP.")

   image_bytes = await file.read()

   if len(image_bytes) > MAX_FILE_SIZE:
      raise HTTPException(status_code=400, detail="Imagem muito grande. Máximo 10MB.")

   # remove fundo (retorna original se rembg indisponível)
   processed = remove_background(image_bytes)

   # categoriza com IA
   try:
      categories = await categorize_clothing(to_base64(processed))
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
         {"content-type": "image/png"}
      )
   except Exception as e:
      raise HTTPException(status_code=500, detail=f"Erro no upload da imagem: {str(e)}")

   image_url = supabase.storage.from_("clothes").get_public_url(storage_path)

   # salva no banco
   cloth = {
      "id":       cloth_id,
      "user_id":  user.id,
      "image_url": image_url,
      **categories
   }

   result = supabase.table("clothes").insert(cloth).execute()
   return result.data[0]

@router.get("/stats")
async def wardrobe_stats(user=Depends(get_current_user)):
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
async def delete_clothing(cloth_id: str, user=Depends(get_current_user)):
   result = (
      supabase.table("clothes")
      .select("id")
      .eq("id", cloth_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Peça não encontrada")

   # remove imagem do storage (não bloqueia se falhar)
   try:
      supabase.storage.from_("clothes").remove([f"{user.id}/{cloth_id}.png"])
   except Exception:
      pass

   supabase.table("clothes").delete().eq("id", cloth_id).eq("user_id", user.id).execute()

   return {"deleted": True}

@router.get("/")
async def list_clothes(
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