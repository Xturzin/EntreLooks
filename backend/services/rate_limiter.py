from collections import defaultdict
from time import time
from fastapi import HTTPException

class _RateLimiter:
   """Janela deslizante em memória, por chave (user_id). Reseta no restart do processo."""

   def __init__(self):
      self._log: dict[str, list[float]] = defaultdict(list)

   def check(self, key: str, limit: int, window: int):
      """Lança 429 se `key` excedeu `limit` chamadas dentro de `window` segundos."""
      now  = time()
      hits = self._log[key]

      self._log[key] = [t for t in hits if now - t < window]

      if len(self._log[key]) >= limit:
         raise HTTPException(
            status_code=429,
            detail="Limite de requisições atingido. Aguarde alguns minutos e tente novamente."
         )

      self._log[key].append(now)


rate_limiter = _RateLimiter()
