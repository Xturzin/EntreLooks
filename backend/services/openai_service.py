import json
from openai import AsyncOpenAI
from config.settings import settings

client = AsyncOpenAI(
   api_key=settings.GROQ_API_KEY,
   base_url="https://api.groq.com/openai/v1"
)

async def categorize_clothing(image_base64: str) -> dict:
   prompt = """Analise esta peça de roupa e responda SOMENTE em JSON, sem texto extra.

   Formato obrigatório:
   {
      "type": "tipo da peça em português (ex: camiseta, calça, vestido, tênis, casaco)",
      "color": "cor principal em português",
      "style": "casual | elegante | esportivo | formal | streetwear",
      "occasion": "dia a dia | trabalho | festa | academia | praia"
   }"""

   response = await client.chat.completions.create(
      model="llama-3.3-70b-versatile",
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

   content = response.choices[0].message.content.strip()
   content = content.replace("```json", "").replace("```", "").strip()

   try:
      return json.loads(content)
   except json.JSONDecodeError:
      raise ValueError(f"IA retornou JSON inválido: {content[:200]}")

async def generate_look_ai(clothes: list, mode: str, weather: dict = None, rejected_context: list = None) -> list:
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
      items = list({
         f"{c.get('type', '')} {c.get('color', '')}".strip()
         for c in rejected_context[:10]
         if c.get('type')
      })[:6]
      if items:
         rejection_context = f"\nEvite combinar peças similares às que o usuário rejeitou antes: {', '.join(items)}."

   prompt = f"""Você é uma estilista pessoal. Monte um look {mode} usando as peças abaixo.{weather_context}{rejection_context}

Peças disponíveis:
{json.dumps(clothes_data, ensure_ascii=False, indent=2)}

Regras:
- Escolha no máximo 1 peça por categoria (1 top, 1 calça/saia, 1 calçado, etc.)
- Priorize combinações harmoniosas de cor e estilo
- Adapte ao modo solicitado: {mode}
- Retorne SOMENTE JSON, sem texto extra

Formato obrigatório:
{{"clothes_ids": ["id1", "id2", "id3"]}}"""

   response = await client.chat.completions.create(
      model="llama-3.3-70b-versatile",
      messages=[{"role": "user", "content": prompt}],
      max_tokens=200
   )

   content = response.choices[0].message.content.strip()
   content = content.replace("```json", "").replace("```", "").strip()

   try:
      return json.loads(content)
   except json.JSONDecodeError:
      raise ValueError(f"IA retornou JSON inválido: {content[:200]}")
   return result.get("clothes_ids", [])

async def chat_with_stylist(message: str, history: list, clothes: list) -> str:
   if clothes:
      items            = [f"{c.get('type', 'peça')} {c.get('color', '')}".strip() for c in clothes]
      wardrobe_summary = ", ".join(items)
   else:
      wardrobe_summary = "guarda-roupa ainda vazio"

   system_prompt = f"""Você é Dora, uma estilista pessoal brasileira descontraída e prática.
Você conhece o guarda-roupa do usuário e ajuda a montar looks, dar dicas de moda e responder dúvidas de estilo.
Seja direta, simpática e use linguagem natural brasileira. Evite respostas longas demais.
Quando sugerir um look, mencione as peças pelo tipo e cor.

Guarda-roupa do usuário: {wardrobe_summary}"""

   messages = [{"role": "system", "content": system_prompt}]

   for msg in history:
      messages.append({"role": msg["role"], "content": msg["content"]})

   messages.append({"role": "user", "content": message})

   response = await client.chat.completions.create(
      model="llama-3.3-70b-versatile",
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

   response = await client.chat.completions.create(
      model="llama-3.3-70b-versatile",
      messages=[{"role": "user", "content": prompt}],
      max_tokens=200
   )

   return response.choices[0].message.content.strip()