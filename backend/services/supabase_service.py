import httpx
from supabase import create_client, Client
from config.settings import settings

if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
   raise RuntimeError("SUPABASE_URL e SUPABASE_KEY são obrigatórios")

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

# Clientes HTTP reaproveitados. Antes cada função abria um httpx.AsyncClient novo por
# chamada, e cada abertura paga o aperto de mão TCP + TLS de novo (uns 47ms num caminho
# curto, mais que isso pro Render, que fica longe do Supabase). Mantendo o cliente vivo no
# módulo, a conexão fica de pé entre as chamadas e esse custo some a partir da segunda.
#
# São dois porque um lado é async (as funções de auth) e o outro é síncrono (o
# check_database, que roda na rota /health, síncrona). Um AsyncClient não serve pra código
# síncrono nem o contrário, então não dá pra juntar num cliente só.
#
# Os timeouts ficam colados em cada cliente e são diferentes de propósito: 15s nas funções
# de auth, e 4s no check_database, porque o /health é batido por um monitor externo e não
# pode ficar pendurado numa queda do banco.
_http_async = httpx.AsyncClient(timeout=15.0)
_http_sync  = httpx.Client(timeout=4.0)

async def fechar_clientes():
   """Fecha os dois clientes no encerramento do servidor (chamado pelo lifespan do main),
   senão o httpx reclama de conexão deixada aberta ao desligar."""
   await _http_async.aclose()
   _http_sync.close()

async def sign_up_user(email: str, password: str):
   response = await _http_async.post(
      f"{settings.SUPABASE_URL}/auth/v1/signup",
      headers={
         "apikey": settings.SUPABASE_ANON_KEY,
         "Content-Type": "application/json"
      },
      json={"email": email, "password": password}
   )
   return response.json(), response.status_code

async def sign_in_user(email: str, password: str):
   response = await _http_async.post(
      f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
      headers={
         "apikey": settings.SUPABASE_ANON_KEY,
         "Content-Type": "application/json"
      },
      json={"email": email, "password": password}
   )
   return response.json(), response.status_code

async def refresh_session(refresh_token: str):
   """Troca um refresh token por um par novo de tokens. O Supabase rotaciona: cada
   renovação devolve um refresh token novo e derruba o anterior, então quem chama
   precisa guardar o que voltou aqui, senão a próxima renovação falha."""
   response = await _http_async.post(
      f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
      headers={
         "apikey": settings.SUPABASE_ANON_KEY,
         "Content-Type": "application/json"
      },
      json={"refresh_token": refresh_token}
   )
   return response.json(), response.status_code

async def update_user_name(token: str, name: str):
   """Grava o nome escolhido no user_metadata da conta, usando o token da própria
   pessoa. O campo 'data' é mesclado no metadata, então dados do login social
   (foto, nome do Google) continuam intactos."""
   response = await _http_async.put(
      f"{settings.SUPABASE_URL}/auth/v1/user",
      headers={
         "apikey": settings.SUPABASE_ANON_KEY,
         "Authorization": f"Bearer {token}",
         "Content-Type": "application/json"
      },
      json={"data": {"name": name}}
   )
   return response.json(), response.status_code

def check_database() -> str:
   """Encosta de leve no banco só pra saber se ele responde. Quem usa isso é o /health,
   que leva um ping externo de dez em dez minutos: como o plano free do Supabase apaga
   projeto que fica parado, é essa consulta que mantém o banco contando como ativo.

   Vai de chave anon de propósito, que é a de menor privilégio. Com o RLS ligado e sem
   ninguém logado ela não enxerga linha nenhuma, e é exatamente isso que a gente quer,
   porque o objetivo aqui é saber se o PostgREST responde, não ler dado.

   Usa o _http_sync do módulo (timeout de 4s), e não o cliente do supabase-py, cujo timeout
   padrão é de 120 segundos. Numa queda do banco o /health ficaria dois minutos pendurado e
   o monitor externo entenderia que a API inteira caiu, que é justamente o que não pode
   acontecer."""
   try:
      response = _http_sync.get(
         f"{settings.SUPABASE_URL}/rest/v1/clothes",
         params={"select": "id", "limit": "1"},
         headers={
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}"
         }
      )
   except Exception as e:
      # só o nome da exceção. O /health é público, então nada de detalhe interno no corpo
      return f"unreachable ({type(e).__name__})"

   if response.status_code >= 400:
      return f"error (HTTP {response.status_code})"

   return "ok"