from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from dependencies import get_current_user
from services.supabase_service import sign_up_user, sign_in_user, update_user_name

router = APIRouter(prefix="/auth", tags=["auth"])

class AuthRequest(BaseModel):
   email: str
   password: str

class NameUpdate(BaseModel):
   name: str

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
      error_desc = result.get("error_description", "")
      if "not confirmed" in error_desc.lower():
         detail = "Confirme seu email antes de entrar. Verifique sua caixa de entrada."
      else:
         detail = "Email ou senha incorretos"
      raise HTTPException(status_code=401, detail=detail)
   return {"token": result.get("access_token")}

@router.get("/me")
async def get_me(user=Depends(get_current_user)):
   # o nome fica no user_metadata da conta (pode não existir ainda)
   meta = getattr(user, "user_metadata", None) or {}
   return {"name": meta.get("name")}

@router.patch("/me")
async def update_me(
   data: NameUpdate,
   authorization: str = Header(...),
   user=Depends(get_current_user)
):
   name = data.name.strip()
   if not name:
      raise HTTPException(status_code=400, detail="Diga um nome pra eu te chamar.")

   token = authorization.replace("Bearer ", "")
   result, status = await update_user_name(token, name)

   if status >= 400:
      raise HTTPException(status_code=400, detail="Não foi possível salvar o nome. Tente de novo.")

   return {"name": name}