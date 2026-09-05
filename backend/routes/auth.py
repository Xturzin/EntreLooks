from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from dependencies import get_current_user
from services.supabase_service import sign_up_user, sign_in_user, update_user_name, refresh_session

router = APIRouter(prefix="/auth", tags=["auth"])

# Rotas que so conversam com o Supabase sao "def" comum, e nao "async def", de proposito.
# O cliente do supabase-py e sincrono: chamado de dentro de uma rota async, ele trava o
# event loop inteiro enquanto espera a resposta, e as requisicoes passam a esperar uma pela
# outra (medido em producao: 8 simultaneas custavam 4,3 vezes o tempo de uma). Declarando a
# rota como def, o FastAPI roda ela numa threadpool e elas voltam a correr em paralelo.
# As rotas que dao await em alguma coisa (IA, leitura de upload, outra corrotina) continuam
# async, porque await so existe dentro de funcao async.
class AuthRequest(BaseModel):
   email: str
   password: str

class NameUpdate(BaseModel):
   name: str

class RefreshRequest(BaseModel):
   refresh_token: str

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

   # o refresh token vem junto na resposta do Supabase. Sem devolver ele aqui, o app
   # ficaria só com o access token, que vence em uma hora e derruba a pessoa no meio do uso.
   return {
      "token":         result.get("access_token"),
      "refresh_token": result.get("refresh_token")
   }

@router.post("/refresh")
async def refresh(data: RefreshRequest):
   """Troca o refresh token por um par novo. Não passa por get_current_user de
   propósito: quem chama aqui está justamente com o access token vencido, então
   exigir um token válido mataria o endpoint."""
   result, status = await refresh_session(data.refresh_token)

   if status >= 400:
      raise HTTPException(status_code=401, detail="Sessão expirada. Entre de novo.")

   access_token  = result.get("access_token")
   refresh_token = result.get("refresh_token")

   # sem o par completo não dá pra seguir: o app precisa dos dois pra renovar de novo depois
   if not access_token or not refresh_token:
      raise HTTPException(status_code=401, detail="Sessão expirada. Entre de novo.")

   return {"access_token": access_token, "refresh_token": refresh_token}

@router.get("/me")
def get_me(user=Depends(get_current_user)):
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