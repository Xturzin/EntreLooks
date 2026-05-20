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