import json
import logging
import re
from openai import AsyncOpenAI, NotFoundError, RateLimitError
from config.settings import settings

logger = logging.getLogger("entrelooks")

client = AsyncOpenAI(
   api_key=settings.GROQ_API_KEY,
   base_url="https://api.groq.com/openai/v1"
)

# Um look só tem cinco espaços desenháveis na colagem: parte de cima, parte de baixo,
# calçado, bolsa e acessório. O teto não é capricho de formato, é o que segura o tamanho da
# resposta: cada id é um uuid e custa perto de 30 tokens, então pedir seis peças já estoura
# o orçamento de saída e a lista volta cortada no meio.
MAX_PECAS_NO_LOOK = 5

# Todo id de peça é um uuid. Serve pra pescar ids de uma resposta que não parseou como JSON,
# que na prática é sempre uma lista cortada no meio de um id.
_UUID = re.compile(
   r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
   re.IGNORECASE
)

# Embrulhos que o modelo põe em volta do JSON quando resolve ser prestativo. Medido em
# respostas reais: cerca de markdown e um bloco <tool_call><function json>.
_CERCA_MARKDOWN = re.compile(r"```[a-z]*", re.IGNORECASE)
_TAG_SOLTA      = re.compile(r"</?[a-z_][a-z0-9_ ]*>", re.IGNORECASE)


def _extract_json(content: str) -> str:
   """Tira o embrulho e devolve só o objeto JSON, quando dá pra achar um.

   O modelo devolve JSON limpo na maioria das vezes, mas quando não devolve o embrulho é
   sempre um destes: cerca de markdown, uma tag no estilo <tool_call>, ou uma frase antes do
   objeto. Nenhum deles é motivo pra jogar a resposta fora."""
   content = _CERCA_MARKDOWN.sub("", content)
   content = _TAG_SOLTA.sub("", content).strip()
   if not content.startswith("{"):
      match = re.search(r"\{.*\}", content, re.DOTALL)
      if match:
         content = match.group(0)
   return content


def _ids_do_look(content: str, ids_validos: set) -> list:
   """Tira os ids das peças da resposta da IA e devolve só os que existem mesmo no armário.

   São duas camadas porque o modelo erra de dois jeitos diferentes, os dois medidos em 24
   gerações reais:

   1. Ele embrulha o JSON. O _extract_json desembrulha e o json.loads resolve.
   2. Ele lista peças demais e a resposta volta cortada no meio de um id. Aí não existe JSON
      pra parsear, mas os ids que vieram inteiros continuam ali, então a gente pesca por
      formato de uuid em vez de descartar a resposta toda. Era este o caso de 10 das 24.

   A conferência contra o armário no fim é o que torna a pescaria segura: id cortado pela
   metade, id inventado ou id de outra pessoa não está no conjunto e cai fora sozinho.

   Também cobre um terceiro caso mais silencioso: o modelo às vezes responde
   {"error": {"message": ...}} explicando que não dava pra montar o look. Isso parseava bem
   e virava lista vazia sem ninguém reclamar, ou seja, look vazio na tela sem erro nenhum.
   Aqui vira lista vazia explícita, e quem chama trata como tentativa que não deu."""
   try:
      resultado = json.loads(_extract_json(content))
      ids = resultado.get("clothes_ids") if isinstance(resultado, dict) else None
   except (json.JSONDecodeError, AttributeError):
      ids = None

   if not ids:
      ids = _UUID.findall(content)

   vistos, limpos = set(), []
   for cid in ids:
      cid = str(cid)
      if cid in ids_validos and cid not in vistos:
         vistos.add(cid)
         limpos.append(cid)

   return limpos[:MAX_PECAS_NO_LOOK]

async def _chamar_ia(funcao: str, max_retries: int = None, **kwargs):
   """Chama a Groq e, quando dá errado, deixa registrado qual dos dois problemas aconteceu,
   antes de repassar o erro pra quem chamou.

   A distinção importa porque os dois pedem coisas opostas. Modelo aposentado é permanente:
   a Groq tira o modelo do ar e a função fica morta até alguém editar o nome dele aqui neste
   arquivo, então isso é error e precisa dizer em qual função quebrou. Já queda da API ou
   estrangulamento por limite passa sozinho, então fica em warning pra não encher o log, que
   no plano free do Render tem retenção curta.

   Foi essa diferença que faltou da última vez: os modelos foram aposentados e o app seguiu
   salvando peça com os campos vazios, sem nada no log que apontasse a causa.

   O erro é repassado intacto de propósito. Cada rota já trata a falha do jeito adequado pra
   ela (o upload cai pra campos nulos, o look devolve 500, o chat e o resumo devolvem 503), e
   o que está aqui é só observabilidade, não muda nada do que a pessoa vê na tela.

   O max_retries serve pra encurtar a insistência do SDK numa chamada específica. Por padrão
   ele reenvia duas vezes esperando o retry-after que a Groq manda, o que é bom quando a
   pessoa disparou a ação e está olhando pro resultado, e ruim no cadastro em série."""
   alvo = client if max_retries is None else client.with_options(max_retries=max_retries)

   try:
      return await alvo.chat.completions.create(**kwargs)
   except Exception as erro:
      if isinstance(erro, NotFoundError) and getattr(erro, "code", None) == "model_not_found":
         # o nome do modelo sai da mensagem da própria Groq em vez de uma cópia da string
         # daqui, senão alguém troca o modelo lá embaixo e o log continua citando o antigo
         detalhe = (getattr(erro, "body", None) or {}).get("message") or str(erro)
         logger.error(
            f"MODELO INDISPONÍVEL em {funcao}: {detalhe} "
            "A função fica sem IA até alguém trocar o modelo em services/openai_service.py."
         )
      elif isinstance(erro, RateLimitError):
         logger.warning(
            f"Cota da Groq estourada em {funcao}: são 8000 tokens por minuto, e esse teto é "
            "do app inteiro, não de cada pessoa. Costuma liberar em menos de um minuto."
         )
      else:
         logger.warning(f"Falha temporária de IA em {funcao}: {type(erro).__name__}")
      raise

async def categorize_clothing(image_base64: str) -> dict:
   prompt = """Analise esta peça de roupa e responda SOMENTE em JSON, sem texto extra.

   Formato obrigatório:
   {
      "type": "tipo da peça em português (ex: camiseta, calça, vestido, tênis, casaco)",
      "color": "cor principal em português",
      "style": "casual | elegante | esportivo | formal | streetwear",
      "occasion": "dia a dia | trabalho | festa | academia | praia"
   }"""

   response = await _chamar_ia(
      "categorize_clothing",
      # sem reenvio aqui, ao contrário das outras três funções. Cada foto consome cerca de
      # 1300 tokens do teto de 8000 por minuto, então na sétima foto seguida a Groq começa a
      # devolver 429. Insistir faria a pessoa esperar mais de 20 segundos por peça justo no
      # cadastro em série, que é quando ela mais quer velocidade. Desistindo na hora, a peça
      # entra em poucos segundos com os campos vazios e ela ajusta nos chips da edição, que é
      # o mesmo caminho de quando a IA erra a classificação.
      max_retries=0,
      # qwen3.8-27b é o único modelo com visão disponível na nossa conta da Groq. Ele é
      # marcado como Preview, o que na Groq significa que pode ser aposentado com pouca
      # antecedência, e já aconteceu com todos os modelos de visão anteriores deles. Se a
      # classificação parar de vir preenchida, o primeiro lugar pra olhar é se ele ainda existe.
      model="qwen/qwen3.8-27b",
      messages=[{
         "role": "user",
         "content": [
            {
               "type": "image_url",
               "image_url": {"url": f"data:image/png;base64,{image_base64}"}
            },
            {"type": "text", "text": prompt}
         ]
      }],
      max_tokens=200
   )

   content = _extract_json(response.choices[0].message.content.strip())

   try:
      return json.loads(content)
   except json.JSONDecodeError:
      raise ValueError(f"IA retornou JSON inválido: {content[:200]}")

async def generate_look_ai(clothes: list, mode: str, weather: dict = None, rejected_context: list = None, positive_context: list = None) -> list:
   clothes_data = [
      {
         "id":       c["id"],
         "type":     c.get("type", "peça"),
         "color":    c.get("color", ""),
         "style":    c.get("style", ""),
         "occasion": c.get("occasion", "")
      }
      for c in clothes
   ]

   weather_context = ""
   if weather:
      temp = weather.get("temperature", "")
      desc = weather.get("description", "")
      weather_context = f"\nClima atual: {desc}, {temp}°C. Adapte o look para esse clima."

   rejection_context = ""
   if rejected_context:
      # Mesmo motivo do _pecas_dos_looks: list(set) devolve ordem que muda a cada
      # processo, e com ela mudam os seis nomes que a IA lê. Aqui a deduplicação preserva
      # a ordem de chegada, que já vem estável de lá.
      vistos, items = set(), []
      for c in rejected_context[:10]:
         if not c.get('type'):
            continue
         nome = f"{c.get('type', '')} {c.get('color', '')}".strip()
         if nome and nome not in vistos:
            vistos.add(nome)
            items.append(nome)
      items = items[:6]
      if items:
         rejection_context = f"\nEvite combinar peças similares às que o usuário rejeitou antes: {', '.join(items)}."

   positive_hint = ""
   if positive_context:
      # Mesmo motivo do _pecas_dos_looks: list(set) devolve ordem que muda a cada
      # processo, e com ela mudam os seis nomes que a IA lê. Aqui a deduplicação preserva
      # a ordem de chegada, que já vem estável de lá.
      vistos, items = set(), []
      for c in positive_context[:10]:
         if not c.get('type'):
            continue
         nome = f"{c.get('type', '')} {c.get('color', '')}".strip()
         if nome and nome not in vistos:
            vistos.add(nome)
            items.append(nome)
      items = items[:6]
      if items:
         positive_hint = f"\nO usuário já gostou de looks com: {', '.join(items)}. Prefira peças similares quando possível."

   prompt = f"""Você é uma estilista pessoal. Monte um look {mode} usando as peças abaixo.{weather_context}{rejection_context}{positive_hint}

Peças disponíveis:
{json.dumps(clothes_data, ensure_ascii=False, indent=2)}

Regras:
- Escolha no máximo 1 peça por categoria (1 top, 1 calça/saia, 1 calçado, etc.)
- No máximo {MAX_PECAS_NO_LOOK} peças no total, e pelo menos 2
- Priorize combinações harmoniosas de cor e estilo
- Adapte ao modo solicitado: {mode}
- Responda com o objeto JSON e mais nada: sem cerca de markdown, sem explicação, sem texto antes nem depois

Formato obrigatório:
{{"clothes_ids": ["id1", "id2", "id3"]}}"""

   ids_validos = {c["id"] for c in clothes}
   content     = ""

   # Duas tentativas.
   #
   # A primeira quase sempre basta agora que o teto de saída cabe a resposta inteira. A
   # segunda existe porque o custo de insistir é uma chamada e o custo de não insistir é um
   # 500 na cara de quem pediu o look.
   #
   # Sobre orçamento, que é a parte que costuma passar batida: a retentativa NÃO gasta uma
   # das 20 gerações por hora, porque o balde é conferido uma vez só, lá na rota. O que ela
   # consome é o teto de 8000 tokens por minuto da Groq, que é do app inteiro. Este prompt
   # custa perto de 1700 tokens medidos, então no pior caso uma geração passa a valer por
   # duas nesse teto. Como as falhas ficaram raras depois do ajuste de max_tokens, o custo
   # médio esperado é bem menor que isso.
   for tentativa in (1, 2):
      response = await _chamar_ia(
         "generate_look_ai",
         # o mesmo modelo da visão, aqui só no modo texto: ele escolhe as peças e devolve os
         # ids. Vale a mesma ressalva de Preview escrita no categorize_clothing.
         model="qwen/qwen3.8-27b",
         messages=[{"role": "user", "content": prompt}],
         # 400 e não 200. Medido em 24 gerações com o teto antigo: 13 voltaram com
         # finish_reason "length" e 10 delas não parseavam, ou seja, 42% de erro 500 só por
         # falta de espaço pra terminar a frase. Um uuid custa perto de 30 tokens e o modelo
         # chegava a listar seis peças, o que não cabia em 200 de jeito nenhum. Aumentar o
         # teto não custa nada por si: a Groq cobra o que foi gerado, não o que foi
         # reservado, e a saída média medida é de 172 tokens.
         max_tokens=400
      )

      content = response.choices[0].message.content.strip()
      ids     = _ids_do_look(content, ids_validos)

      # Menos de duas peças não é look, é peça solta. Pode ser resposta cortada cedo demais,
      # pode ser o modelo dizendo que não dá pra montar. Nos dois casos vale tentar de novo.
      if len(ids) >= 2:
         return ids

      logger.warning(
         f"generate_look_ai: tentativa {tentativa} não rendeu look "
         f"(finish={response.choices[0].finish_reason}, {len(ids)} peça(s) válida(s))"
      )

   raise ValueError(f"IA não devolveu peças válidas do armário: {content[:200]}")

async def chat_with_stylist(
   message: str,
   history: list,
   clothes: list,
   name: str = None,
   weather: dict = None,
   planned: list = None,
   key_pieces: dict = None
) -> str:
   if clothes:
      items            = [f"{c.get('type', 'peça')} {c.get('color', '')}".strip() for c in clothes]
      wardrobe_summary = ", ".join(items)
   else:
      wardrobe_summary = "guarda-roupa ainda vazio"

   # se a pessoa disse o nome no onboarding, a Mira chama por ele de vez em quando
   name_line = f"\nO nome da pessoa é {name}. Chame pelo nome de vez em quando, de forma natural, sem exagerar." if name else ""

   # clima de agora, pra ela não sugerir casaco em dia de 35 graus
   weather_line = ""
   if weather:
      temp = weather.get("temperature", "")
      desc = weather.get("description", "")
      weather_line = f"\nClima agora: {desc}, {temp}°C. Leve isso em conta ao sugerir roupa."

   # o que a pessoa já deixou planejado pros próximos dias
   planned_line = ""
   if planned:
      linhas = [
         f"{p['date']}: look {p.get('mode', 'casual')} com {', '.join(p['pieces'][:4])}"
         for p in planned[:5] if p.get("pieces")
      ]
      if linhas:
         planned_line = (
            "\nLooks que ela já planejou pros próximos dias:\n- "
            + "\n- ".join(linhas)
            + "\nNão repita esses looks e considere o que já está reservado."
         )

   # peças que ela mais repete em cada ocasião, as favoritas dela
   key_line = ""
   if key_pieces:
      linhas = [f"{modo}: {', '.join(nomes)}" for modo, nomes in key_pieces.items() if nomes]
      if linhas:
         key_line = (
            "\nPeças que ela mais usa em cada ocasião (as favoritas dela):\n- "
            + "\n- ".join(linhas)
            + "\nUse essas peças-chave como âncora quando sugerir look pra essas ocasiões."
         )

   system_prompt = f"""Você é Mira, uma estilista pessoal brasileira descontraída e prática.
Você conhece o guarda-roupa do usuário e ajuda a montar looks, dar dicas de moda e responder dúvidas de estilo.
Seja direta, simpática e use linguagem natural brasileira. Evite respostas longas demais.
Quando sugerir um look, mencione as peças pelo tipo e cor.
Se, e só se, você estiver sugerindo um look completo pra vestir, feche a mensagem com uma linha começando por "Look:" listando as peças escolhidas pelo tipo e pela cor, separadas por vírgula. Exemplo: Look: camisa azul, calça preta, bota marrom.
Não escreva essa linha quando estiver comentando uma peça, comparando tecidos ou tirando dúvida, mesmo que cite roupas no meio da conversa.{name_line}{weather_line}{planned_line}{key_line}

Guarda-roupa do usuário: {wardrobe_summary}"""

   messages = [{"role": "system", "content": system_prompt}]

   for msg in history:
      messages.append({"role": msg["role"], "content": msg["content"]})

   messages.append({"role": "user", "content": message})

   response = await _chamar_ia(
      "chat_with_stylist",
      # entre os modelos da conta, o qwen3.8-27b é o que escreve português brasileiro mais
      # solto, que é o que segura a voz da Mira. Mesma ressalva de Preview.
      model="qwen/qwen3.8-27b",
      messages=messages,
      max_tokens=500
   )

   return response.choices[0].message.content

async def generate_style_summary(stats: dict, clothes: list) -> str:
   if not clothes:
      return None

   prompt = f"""Analise o guarda-roupa abaixo e escreva um parágrafo curto e descontraído descrevendo o estilo pessoal do usuário.
Escreva em português, de forma direta e natural, como uma estilista falando para o cliente.
Máximo 3 frases.

Total de peças: {stats['total']}
Cores dominantes: {[c['name'] for c in stats['dominant_colors']]}
Estilos: {[s['name'] for s in stats['top_styles']]}
Tipos de peça: {[t['name'] for t in stats['top_types']]}
Ocasiões: {[o['name'] for o in stats['top_occasions']]}"""

   response = await _chamar_ia(
      "generate_style_summary",
      # aqui é gpt-oss-120b e não o qwen, de propósito. Primeiro porque ele é Production, sem
      # o risco de sumir de uma hora pra outra. Segundo porque a cota da Groq é contada por
      # modelo, então espalhar as funções em dois modelos dobra o teto diário do app inteiro.
      model="openai/gpt-oss-120b",
      messages=[{"role": "user", "content": prompt}],
      # ele raciocina antes de responder e esse raciocínio consome o mesmo orçamento. Em 8
      # medições gastou de 141 a 336 tokens, então com os 200 de antes o resumo chegava
      # cortado no meio da frase quase metade das vezes.
      max_tokens=400
   )

   return response.choices[0].message.content.strip()