import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from dependencies import get_current_user
from services.image_service import remove_background, to_base64
from services.openai_service import categorize_clothing
from services.supabase_service import supabase

router = APIRouter(prefix="/clothes", tags=["clothes"])

@router.post("/")
async def upload_clothing(
   file: UploadFile = File(...),
   user=Depends(get_current_user)
):
   image_bytes = await file.read()

   # remove fundo (retorna original se rembg indisponível)
   processed = remove_background(image_bytes)

   # categoriza com IA
   try:
      categories = await categorize_clothing(to_base64(processed))
   except Exception:
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

@router.get("/")
async def list_clothes(user=Depends(get_current_user)):
   result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", desc=True)
      .execute()
   )
   return result.data