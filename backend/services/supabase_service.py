import httpx
from supabase import create_client, Client
from config.settings import settings

if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
   raise RuntimeError("SUPABASE_URL e SUPABASE_KEY são obrigatórios")

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

async def sign_up_user(email: str, password: str):
   async with httpx.AsyncClient(timeout=15.0) as client:
      response = await client.post(
         f"{settings.SUPABASE_URL}/auth/v1/signup",
         headers={
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
         },
         json={"email": email, "password": password}
      )
      return response.json(), response.status_code

async def sign_in_user(email: str, password: str):
   async with httpx.AsyncClient(timeout=15.0) as client:
      response = await client.post(
         f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
         headers={
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
         },
         json={"email": email, "password": password}
      )
      return response.json(), response.status_code

async def update_user_name(token: str, name: str):
   """Grava o nome escolhido no user_metadata da conta, usando o token da própria
   pessoa. O campo 'data' é mesclado no metadata, então dados do login social
   (foto, nome do Google) continuam intactos."""
   async with httpx.AsyncClient(timeout=15.0) as client:
      response = await client.put(
         f"{settings.SUPABASE_URL}/auth/v1/user",
         headers={
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
         },
         json={"data": {"name": name}}
      )
      return response.json(), response.status_code