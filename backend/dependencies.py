from fastapi import Header, HTTPException
import logging
import time
import jwt
from config.settings import settings

logger = logging.getLogger("entrelooks")

# Validação de token feita aqui no backend, conferindo a assinatura contra a chave pública
# do Supabase, em vez de perguntar ao Supabase a cada requisição. Isso tira uma ida à rede
# de toda chamada autenticada (uns 190ms no Render, que fica longe do Supabase, em Oregon).
#
# O preço dessa escolha, e é uma escolha consciente, não um descuido: um token revogado no
# painel continua sendo aceito até expirar sozinho, no máximo uma hora, porque ninguém mais
# pergunta ao Supabase se ele ainda vale. Para um app pessoal, com token de vida curta, o
# ganho de velocidade compensa essa janela.

_JWKS_URL = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

# O PyJWKClient guarda o conjunto de chaves em memória e só vai à rede quando o cache está
# vazio (primeira requisição, inclusive logo depois de cada restart do Render free) ou
# quando ele expira.
#
# lifespan de 6 horas, e não os 5 minutos que estavam aqui antes. O motivo: quando o cache
# vence, a próxima requisição autenticada paga a busca do JWKS, que daqui até o Supabase
# custa perto de 900ms. Com 5 minutos isso virava um pico de quase um segundo várias vezes
# por hora, numa rota que normalmente responde em 200ms, e sem ganho nenhum: rotação de
# chave já é detectada na hora pelo caminho do kid desconhecido logo abaixo, que não depende
# deste prazo. Ou seja, o lifespan curto só servia como rede de segurança de uma rede de
# segurança, e cobrava caro por isso.
_jwks_client = jwt.PyJWKClient(_JWKS_URL, cache_jwk_set=True, lifespan=6 * 60 * 60)

# Proteção contra kid desconhecido usado como ataque. Sozinho, o PyJWKClient rebusca o JWKS
# toda vez que aparece um kid que ele não conhece (está no get_signing_key da lib), então
# uma enxurrada de tokens com kid aleatório viraria uma enxurrada de buscas ao Supabase, um
# jeito barato de derrubar o serviço. Por isso a rebusca forçada acontece no máximo uma vez
# a cada _JANELA_REFETCH. 60s equilibra os dois lados: sob ataque, no máximo uma ida à rede
# por minuto; e rotação legítima de chave é detectada em até 60s, folgado dentro do tempo em
# que o Supabase mantém a chave antiga válida em paralelo com a nova. É este caminho, e não
# o lifespan, que garante que uma rotação seja percebida rápido.
_JANELA_REFETCH = 60
_ultimo_refetch_forcado = 0.0


class _UsuarioDoToken:
   """Espelha o que o resto do código espera do objeto de usuário: .id e .user_metadata.
   Antes isso vinha pronto do supabase-py; agora é montado a partir dos claims do próprio
   token, sem ir à rede."""
   __slots__ = ("id", "user_metadata")

   def __init__(self, claims):
      self.id            = claims["sub"]
      self.user_metadata = claims.get("user_metadata") or {}


def _chave_do_token(token):
   """Devolve a chave pública que assinou o token, ou None se o kid não for reconhecido.
   Rebusca o JWKS no máximo uma vez por janela, pra kid inventado não virar porta de ataque.
   Pode levantar PyJWKClientError se o endpoint de chaves não responder."""
   global _ultimo_refetch_forcado

   kid = jwt.get_unverified_header(token).get("kid")

   # caminho normal: chave já no cache. Só vai à rede se o cache estiver vazio ou vencido,
   # e essas idas são limitadas pelo próprio lifespan, não pelo que o cliente manda.
   for chave in _jwks_client.get_jwk_set(refresh=False).keys:
      if chave.key_id == kid:
         return chave.key

   # kid fora do cache: ou o Supabase rotacionou a chave (vale rebuscar), ou é um kid
   # inventado (não vale ir à rede). A janela decide: dentro dela, recusa sem tocar na rede.
   if time.monotonic() - _ultimo_refetch_forcado < _JANELA_REFETCH:
      return None
   _ultimo_refetch_forcado = time.monotonic()

   for chave in _jwks_client.get_jwk_set(refresh=True).keys:
      if chave.key_id == kid:
         return chave.key
   return None


def _validar_pelo_supabase(token):
   """Plano B, usado só quando o JWKS não responde: valida o token perguntando ao Supabase,
   que é a mesma fonte de confiança de antes, só mais lenta. Devolve o objeto de usuário do
   supabase-py, que também tem .id e .user_metadata."""
   from services.supabase_service import supabase
   try:
      return supabase.auth.get_user(token).user
   except Exception as e:
      logger.warning(f"Falha de autenticação (validação remota): {type(e).__name__}")
      raise HTTPException(status_code=401, detail="Token inválido ou expirado")


# def comum, não async, de propósito: o FastAPI roda dependência síncrona numa threadpool,
# então a validação local (rápida) e as idas raras à rede (JWKS ou plano B) não travam o
# event loop nem enfileiram uma requisição atrás da outra.
def get_current_user(authorization: str = Header(...)):
   if not authorization.startswith("Bearer "):
      raise HTTPException(status_code=401, detail="Token inválido")

   token = authorization[len("Bearer "):]

   try:
      try:
         chave = _chave_do_token(token)
      except jwt.PyJWKClientError:
         # o endpoint de chaves não respondeu (blip de rede, ou primeiro acesso logo após um
         # restart com o Supabase fora do ar). Em vez de deslogar todo mundo, cai no plano B
         # por esta requisição. Quando o JWKS voltar, a validação rápida volta sozinha.
         logger.warning("JWKS indisponível, validando este token pelo Supabase")
         return _validar_pelo_supabase(token)

      if chave is None:
         # kid que não existe no JWKS, ou dentro da janela anti-ataque: o token não é nosso.
         # Não cai no plano B de propósito: senão kid inventado reabriria o ataque pela via
         # remota, uma ida ao Supabase por token forjado.
         logger.warning("Falha de autenticação: kid desconhecido")
         raise HTTPException(status_code=401, detail="Token inválido ou expirado")

      # além da assinatura: exp (via decode), audience "authenticated" (senão um token de
      # outra audiência do mesmo projeto passaria) e uma folga de 10s no relógio, porque
      # backend e Supabase podem estar levemente dessincronizados e um token recém-emitido
      # seria recusado por "iat no futuro".
      claims = jwt.decode(
         token,
         chave,
         algorithms=["ES256"],
         audience="authenticated",
         leeway=10,
      )
      return _UsuarioDoToken(claims)

   except HTTPException:
      raise
   except jwt.ExpiredSignatureError:
      logger.warning("Falha de autenticação: token expirado")
      raise HTTPException(status_code=401, detail="Token inválido ou expirado")
   except jwt.InvalidSignatureError:
      logger.warning("Falha de autenticação: assinatura inválida")
      raise HTTPException(status_code=401, detail="Token inválido ou expirado")
   except jwt.InvalidTokenError as e:
      # cobre o resto: audience errada, token malformado, iat/nbf fora da folga, etc.
      logger.warning(f"Falha de autenticação: {type(e).__name__}")
      raise HTTPException(status_code=401, detail="Token inválido ou expirado")