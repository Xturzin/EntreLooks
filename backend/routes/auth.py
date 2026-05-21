from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.supabase_service import sign_up_user, sign_in_user

router = APIRouter(prefix="/auth", tags=["auth"])

class AuthRequest(BaseModel):
   email: str
   password: str

@router.post("/signup")
async def signup(data: AuthRequest):
   if len(data.password) < 6:
      raise HTTPException(status_code=400, detail="A senha precisa ter pelo menos 6 caracteres.")

   result, status = await sign_up_user(data.email, data.password)

   if status >= 400:
      raise HTTPException(status_code=400, detail="Não foi possível criar a conta. Verifique o email informado.")

   return {"message": "Conta criada com sucesso"}

@router.post("/login")
async def login(data: AuthRequest):
   result, status = await sign_in_user(data.email, data.password)
   if status >= 400:
      raise HTTPException(status_code=401, detail="Email ou senha incorretos")
   return {"token": result.get("access_token")}