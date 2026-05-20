import json
from openai import AsyncOpenAI
from config.settings import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

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
      model="gpt-4o",
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
   return json.loads(content)

async def generate_look_ai(clothes: list, mode: str) -> list:
   clothes_data = [
      {
         "id":      c["id"],
         "type":    c.get("type", "peça"),
         "color":   c.get("color", ""),
         "style":   c.get("style", ""),
         "occasion": c.get("occasion", "")
      }
      for c in clothes
   ]

   prompt = f"""Você é uma estilista pessoal. Monte um look {mode} usando as peças abaixo.

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
      model="gpt-4o",
      messages=[{"role": "user", "content": prompt}],
      max_tokens=200
   )

   content = response.choices[0].message.content.strip()
   content = content.replace("```json", "").replace("```", "").strip()
   result  = json.loads(content)
   return result.get("clothes_ids", [])