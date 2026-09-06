from collections import defaultdict
from time import time
from fastapi import HTTPException

class _RateLimiter:
   """Janela deslizante em memória, um contador por balde e por pessoa. Reseta no restart
   do processo.

   O balde é obrigatório e é o que separa as funções umas das outras. Antes daqui a chave
   era só o user_id, então TODAS as rotas escreviam na mesma lista e cada uma comparava o
   total contra o próprio teto. Na prática os números viravam limiares num contador só:
   cinco mensagens de chat já travavam a análise de estilo, que tem teto 5, e quinze ações
   de qualquer tipo travavam a geração de look.
   """

   def __init__(self):
      self._log: dict[str, list[float]] = defaultdict(list)

   def check(self, balde: str, user_id: str, limit: int, window: int):
      """Lança 429 se essa pessoa excedeu `limit` chamadas desse balde em `window` segundos."""
      chave = f"{balde}:{user_id}"

      now  = time()
      hits = self._log[chave]

      self._log[chave] = [t for t in hits if now - t < window]

      if len(self._log[chave]) >= limit:
         raise HTTPException(
            status_code=429,
            detail="Limite de requisições atingido. Aguarde alguns minutos e tente novamente."
         )

      self._log[chave].append(now)


rate_limiter = _RateLimiter()
