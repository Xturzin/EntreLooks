"""Confere se o ambiente do EntreLooks está inteiro, antes de abrir o app.

Rode de dentro da pasta backend, com o .env no lugar:

   python check_setup.py

Sai com código 0 se estiver tudo certo e 1 se algum item falhar, então serve pra
usar em automação depois. Nenhuma chave aparece na tela: JWT que por acaso venha
dentro de mensagem de erro de biblioteca é apagado antes de imprimir.
"""

import base64
import json
import re
import socket
import sys
import time
from urllib.parse import urlparse

import httpx

from config.settings import settings

TABELAS = ["clothes", "looks", "look_interactions", "planned_looks", "user_style_profile"]
BUCKET  = "clothes"
TIMEOUT = 10.0

# Qualquer coisa com cara de JWT vira [oculto] antes de ir pra tela. É a rede de
# segurança pra mensagem de erro vinda de biblioteca, cujo conteúdo a gente não controla.
_PARECE_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+")

def limpar(texto) -> str:
   return _PARECE_JWT.sub("[oculto]", str(texto))


resultados = []

def registrar(nome: str, ok: bool, detalhe: str = ""):
   resultados.append((nome, ok, limpar(detalhe)))
   return ok


def claims_do_jwt(token: str) -> dict:
   """Lê só a parte pública do JWT (o payload). A assinatura, que é o segredo de
   verdade, não é tocada nem impressa."""
   corpo = token.split(".")[1]
   corpo += "=" * (-len(corpo) % 4)
   return json.loads(base64.urlsafe_b64decode(corpo))


def cabecalhos(chave: str) -> dict:
   return {"apikey": chave, "Authorization": f"Bearer {chave}"}


def verificar_variaveis() -> bool:
   faltando = [
      nome for nome in ("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_ANON_KEY")
      if not getattr(settings, nome)
   ]
   if faltando:
      return registrar("variáveis de ambiente", False, f"faltando: {', '.join(faltando)}")
   return registrar("variáveis de ambiente", True, "as três estão presentes")


def verificar_chaves() -> bool:
   """Confere se as duas chaves foram emitidas pro mesmo projeto que a URL aponta, e se
   cada uma tem o papel esperado. Chave de outro projeto é o erro clássico de quem
   acabou de migrar, e o sintoma é um 401 confuso lá na frente."""
   host = urlparse(settings.SUPABASE_URL).hostname or ""
   ref_da_url = host.split(".")[0]
   tudo_ok = True

   for nome, chave, papel_esperado in (
      ("SUPABASE_KEY", settings.SUPABASE_KEY, "service_role"),
      ("SUPABASE_ANON_KEY", settings.SUPABASE_ANON_KEY, "anon"),
   ):
      try:
         claims = claims_do_jwt(chave)
      except Exception as e:
         tudo_ok = registrar(f"chave {nome}", False, f"não decodifica como JWT: {type(e).__name__}") and tudo_ok
         continue

      ref = claims.get("ref")
      papel = claims.get("role")

      if ref != ref_da_url:
         tudo_ok = registrar(f"chave {nome}", False, f"ref {ref} não bate com a URL, que é {ref_da_url}") and tudo_ok
      elif papel != papel_esperado:
         tudo_ok = registrar(f"chave {nome}", False, f"role {papel}, esperado {papel_esperado}") and tudo_ok
      else:
         registrar(f"chave {nome}", True, f"ref {ref}, role {papel}")

   return tudo_ok


def verificar_host() -> bool:
   host = urlparse(settings.SUPABASE_URL).hostname or ""

   try:
      socket.gethostbyname(host)
   except Exception as e:
      return registrar("host do Supabase", False, f"{host} não resolve no DNS ({type(e).__name__}), projeto pode ter sido apagado")

   try:
      inicio = time.time()
      r = httpx.get(f"{settings.SUPABASE_URL}/auth/v1/health",
                    headers=cabecalhos(settings.SUPABASE_ANON_KEY), timeout=TIMEOUT)
      ms = round((time.time() - inicio) * 1000)
   except Exception as e:
      return registrar("host do Supabase", False, f"resolve mas não responde: {type(e).__name__}")

   if r.status_code >= 400:
      return registrar("host do Supabase", False, f"respondeu HTTP {r.status_code}")
   return registrar("host do Supabase", True, f"responde em {ms}ms")


def verificar_tabelas() -> bool:
   """Um select de uma linha em cada tabela. Tabela vazia é resultado esperado aqui, o
   que importa é o PostgREST não devolver erro. Usa a service_role de propósito, pra
   um problema de RLS não se disfarçar de tabela faltando."""
   tudo_ok = True
   for tabela in TABELAS:
      try:
         r = httpx.get(f"{settings.SUPABASE_URL}/rest/v1/{tabela}",
                       params={"select": "*", "limit": "1"},
                       headers=cabecalhos(settings.SUPABASE_KEY), timeout=TIMEOUT)
      except Exception as e:
         tudo_ok = registrar(f"tabela {tabela}", False, f"falha de conexão: {type(e).__name__}") and tudo_ok
         continue

      if r.status_code == 404:
         tudo_ok = registrar(f"tabela {tabela}", False, "não existe, rode o backend/schema.sql") and tudo_ok
      elif r.status_code >= 400:
         tudo_ok = registrar(f"tabela {tabela}", False, f"HTTP {r.status_code}: {r.text[:120]}") and tudo_ok
      else:
         linhas = len(r.json())
         tudo_ok = registrar(f"tabela {tabela}", True, f"select ok, {linhas} linha(s)") and tudo_ok

   return tudo_ok


def verificar_bucket() -> bool:
   try:
      r = httpx.get(f"{settings.SUPABASE_URL}/storage/v1/bucket",
                    headers=cabecalhos(settings.SUPABASE_KEY), timeout=TIMEOUT)
   except Exception as e:
      return registrar(f"bucket {BUCKET}", False, f"falha de conexão: {type(e).__name__}")

   if r.status_code >= 400:
      return registrar(f"bucket {BUCKET}", False, f"não consegui listar os buckets, HTTP {r.status_code}")

   buckets = {b["name"]: b for b in r.json()}
   if BUCKET not in buckets:
      achados = ", ".join(buckets) if buckets else "nenhum"
      return registrar(f"bucket {BUCKET}", False, f"não existe, crie no painel. Buckets no projeto: {achados}")

   if not buckets[BUCKET].get("public"):
      return registrar(f"bucket {BUCKET}", False, "existe mas está privado, as fotos do app não vão carregar")

   return registrar(f"bucket {BUCKET}", True, "existe e está público")


def main() -> int:
   # No Windows, quando a saída vai pra um arquivo ou pra outro comando, o Python usa a
   # codepage do sistema e os acentos saem quebrados. Como a ideia é poder usar isso em
   # automação, força UTF-8 aqui.
   try:
      sys.stdout.reconfigure(encoding="utf-8", errors="replace")
   except Exception:
      pass

   print("EntreLooks, verificação de ambiente")
   print()

   if verificar_variaveis():
      verificar_chaves()
      if verificar_host():
         verificar_tabelas()
         verificar_bucket()
      else:
         registrar("tabelas e bucket", False, "pulado, o host não respondeu")

   largura = max(len(nome) for nome, _, _ in resultados)
   falhas = 0

   for nome, ok, detalhe in resultados:
      marca = "ok   " if ok else "falha"
      if not ok:
         falhas += 1
      print(f"  [{marca}] {nome.ljust(largura)}  {detalhe}")

   print()
   if falhas:
      print(f"{falhas} item(ns) com problema.")
      return 1

   print("Tudo certo.")
   return 0


if __name__ == "__main__":
   sys.exit(main())