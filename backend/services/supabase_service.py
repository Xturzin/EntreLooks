import httpx
from supabase import create_client, Client
from config.settings import settings

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