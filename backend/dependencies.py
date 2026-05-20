from fastapi import Header, HTTPException
from services.supabase_service import supabase

async def get_current_user(authorization: str = Header(...)):
   if not authorization.startswith("Bearer "):
      raise HTTPException(status_code=401, detail="Token inválido")

   token = authorization.replace("Bearer ", "")

   try:
      response = supabase.auth.get_user(token)
      return response.user
   except Exception:
      raise HTTPException(status_code=401, detail="Token inválido ou expirado")