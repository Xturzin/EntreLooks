from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from dependencies import get_current_user
from services.supabase_service import supabase
from services.openai_service import generate_look_ai
from services.rate_limiter import rate_limiter

router = APIRouter(prefix="/looks", tags=["looks"])

# Rotas que so conversam com o Supabase sao "def" comum, e nao "async def", de proposito.
# O cliente do supabase-py e sincrono: chamado de dentro de uma rota async, ele trava o
# event loop inteiro enquanto espera a resposta, e as requisicoes passam a esperar uma pela
# outra (medido em producao: 8 simultaneas custavam 4,3 vezes o tempo de uma). Declarando a
# rota como def, o FastAPI roda ela numa threadpool e elas voltam a correr em paralelo.
# As rotas que dao await em alguma coisa (IA, leitura de upload, outra corrotina) continuam
# async, porque await so existe dentro de funcao async.
class GenerateLookRequest(BaseModel):
   mode:    str            = "casual"
   weather: Optional[dict] = None

class PlanRequest(BaseModel):
   look_id: str
   date:    str   # formato YYYY-MM-DD

class CreateLookRequest(BaseModel):
   clothes_ids: List[str]
   mode:        str = "casual"

@router.get("/count")
def count_saved_looks(user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .select("id", count="exact")
      .eq("user_id", user.id)
      .eq("saved", True)
      .execute()
   )
   return {"count": result.count or 0}

@router.post("/generate")
async def generate_look(data: GenerateLookRequest, user=Depends(get_current_user)):
   # 20 e não 15 porque recusar um look gera outro na sequência: quem recusa três vezes já
   # gastou quatro do teto numa interação só.
   rate_limiter.check("look", user.id, limit=20, window=3600)  # 20 looks/hora

   clothes_result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .limit(30)
      .execute()
   )
   clothes = clothes_result.data

   if len(clothes) < 2:
      raise HTTPException(
         status_code=400,
         detail="Adicione pelo menos 2 peças ao armário para gerar um look"
      )

   # Indexa as peças por id uma vez só. Serve para os dois contextos logo abaixo e, no
   # fim da rota, para devolver os dados completos das peças que a IA escolheu.
   clothes_map = {c["id"]: c for c in clothes}

   # Contexto de aprendizado. Os dois helpers recebem o índice pronto porque as peças dos
   # looks passados são as mesmas peças do armário, e o select lá em cima já trouxe type,
   # color e style de todas elas. Antes cada helper ia ao banco buscar de novo essas três
   # colunas de peças que já estavam aqui na memória, o que custava duas consultas a mais
   # justamente na rota mais lenta do app.
   #
   # Ficaram em sequência e não dentro de um asyncio.gather porque o gather não trazia
   # paralelismo nenhum: nenhum dos dois dá await em nada, o cliente do Supabase é
   # síncrono, então as corrotinas rodavam uma depois da outra do mesmo jeito. Sem o
   # gather fica visível que a execução é sequencial de verdade.
   rejected_context = _get_rejection_context(user.id, clothes_map)
   positive_context = _get_positive_context(user.id, clothes_map)

   try:
      clothes_ids = await generate_look_ai(clothes, data.mode, data.weather, rejected_context, positive_context)
   except Exception:
      raise HTTPException(status_code=500, detail="Erro ao gerar o look. Tente novamente.")

   if not clothes_ids:
      raise HTTPException(status_code=500, detail="A IA não conseguiu montar um look. Tente novamente.")

   # salva no banco
   look = {
      "user_id":     user.id,
      "clothes_ids": clothes_ids,
      "mode":        data.mode,
      "saved":       False
   }

   result    = supabase.table("looks").insert(look).execute()
   look_data = result.data[0]

   # popula com os dados completos das peças
   look_data["clothes"] = [clothes_map[id] for id in clothes_ids if id in clothes_map]

   return look_data

@router.post("/manual")
async def create_manual_look(data: CreateLookRequest, user=Depends(get_current_user)):
   if len(data.clothes_ids) < 2:
      raise HTTPException(
         status_code=400,
         detail="Selecione pelo menos 2 peças para montar um look"
      )

   # valida que as peças existem e pertencem ao usuário
   clothes_result = (
      supabase.table("clothes")
      .select("*")
      .eq("user_id", user.id)
      .in_("id", data.clothes_ids)
      .execute()
   )
   clothes     = clothes_result.data
   clothes_map = {c["id"]: c for c in clothes}

   # preserva a ordem escolhida pelo usuário, descartando ids inválidos
   ordered_ids = [cid for cid in data.clothes_ids if cid in clothes_map]

   if len(ordered_ids) < 2:
      raise HTTPException(
         status_code=400,
         detail="Selecione pelo menos 2 peças válidas do seu armário"
      )

   look = {
      "user_id":     user.id,
      "clothes_ids": ordered_ids,
      "mode":        data.mode,
      "saved":       True
   }

   result    = supabase.table("looks").insert(look).execute()
   look_data = result.data[0]

   await _track_wear(ordered_ids, user.id)

   look_data["clothes"] = [clothes_map[id] for id in ordered_ids]

   return look_data

# O contexto positivo vem de looks.saved, e nao do look_interactions, de proposito.
#
# Salvar um look e um evento so: o save_look marca looks.saved = True. Ler isso da tabela
# de interacoes traria exatamente a mesma informacao custando uma consulta a mais (tres em
# vez de duas), e numa rota que ja e a mais lenta do app. Como os dois helpers sao chamados
# em sequencia, essa consulta extra seria uns 190ms cheios no caminho critico.
#
# Por isso o look_interactions guarda hoje apenas as rejeicoes, que nao tem equivalente em
# nenhuma coluna de looks e por isso precisam mesmo de tabela propria.
def _get_positive_context(user_id: str, clothes_map: dict) -> list:
   try:
      saved = (
         supabase.table("looks")
         .select("clothes_ids")
         .eq("user_id", user_id)
         .eq("saved", True)
         .order("created_at", desc=True)
         .limit(5)
         .execute()
      )
   except Exception:
      return []

   return _pecas_dos_looks(saved.data, clothes_map)

def _get_rejection_context(user_id: str, clothes_map: dict) -> list:
   try:
      rejections = (
         supabase.table("look_interactions")
         .select("look_id")
         .eq("user_id", user_id)
         .eq("action", "rejected")
         .order("created_at", desc=True)
         .limit(8)
         .execute()
      )

      if not rejections.data:
         return []

      rejected_ids = [r["look_id"] for r in rejections.data]

      rejected_looks = (
         supabase.table("looks")
         .select("clothes_ids")
         .in_("id", rejected_ids)
         .execute()
      )
   except Exception:
      return []

   return _pecas_dos_looks(rejected_looks.data, clothes_map)

# Junta as peças que aparecem nos looks recebidos e devolve as três colunas que o prompt
# usa. Os ids passam por um set porque a mesma peça costuma repetir em vários looks, e o
# corte em 20 é o mesmo de antes, quando essa lista virava um "in" no banco: ele segura o
# tamanho do contexto que chega no prompt.
#
# Peça que não está no índice é ignorada, e isso acontece em dois casos. Um é peça apagada
# do armário, cujo id continua no clothes_ids do look antigo, porque a coluna é um array de
# uuid sem chave estrangeira. O outro é peça que ficou fora do limit(30) de quem tem
# armário grande. Nos dois casos ela também não está entre as opções que a IA recebe, então
# citá-la no contexto seria falar de roupa que não pode ser escolhida.
def _pecas_dos_looks(looks: list, clothes_map: dict) -> list:
   # Deduplicação preservando a ordem, e não um set.
   #
   # Com set, a ordem de iteração depende do hash das strings, que o Python embaralha a cada
   # processo. O efeito era a frase que chega no prompt mudar a cada restart do Render, com
   # os mesmos dados e o mesmo código: a mesma pergunta dava resposta diferente por acidente,
   # e quem fosse comparar saídas ia caçar uma regressão que não existe.
   #
   # A ordem daqui passa a ser a dos looks recebidos, que vêm do mais recente pro mais
   # antigo. Além de estável, é a ordem que faz sentido quando o corte em 20 entra: peça de
   # look recente conta mais que peça de look velho.
   vistos, ids = set(), []
   for look in looks:
      for cid in look.get("clothes_ids", []):
         if cid not in vistos:
            vistos.add(cid)
            ids.append(cid)

   pecas = []
   for cid in ids[:20]:
      peca = clothes_map.get(cid)
      if peca:
         pecas.append({
            "type":  peca.get("type"),
            "color": peca.get("color"),
            "style": peca.get("style"),
         })

   return pecas

@router.delete("/{look_id}")
def delete_look(look_id: str, user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .select("id")
      .eq("id", look_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   supabase.table("looks").delete().eq("id", look_id).eq("user_id", user.id).execute()

   return {"deleted": True}

@router.patch("/{look_id}/save")
async def save_look(look_id: str, user=Depends(get_current_user)):
   result = (
      supabase.table("looks")
      .update({"saved": True})
      .eq("id", look_id)
      .eq("user_id", user.id)
      .execute()
   )

   if not result.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   clothes_ids = result.data[0].get("clothes_ids", [])
   await _track_wear(clothes_ids, user.id)

   # Aqui existia um insert de action="accepted" no look_interactions. Ele saiu porque
   # gravava o mesmo evento duas vezes: salvar um look ja marca looks.saved = True logo
   # acima, e era de la que o contexto positivo lia. Ninguem lia a linha "accepted", entao
   # ela era escrita por escrever. Ver a explicacao no _get_positive_context.
   return {"saved": True}

@router.post("/{look_id}/reject")
def reject_look(look_id: str, user=Depends(get_current_user)):
   try:
      existing = (
         supabase.table("look_interactions")
         .select("id")
         .eq("user_id", user.id)
         .eq("look_id", look_id)
         .eq("action", "rejected")
         .limit(1)
         .execute()
      )

      if not existing.data:
         supabase.table("look_interactions").insert({
            "user_id": user.id,
            "look_id": look_id,
            "action":  "rejected"
         }).execute()

   except Exception:
      pass

   return {"rejected": True}

async def _track_wear(clothes_ids: list, user_id: str):
   if not clothes_ids:
      return

   now = datetime.now(timezone.utc).isoformat()

   try:
      worn = (
         supabase.table("clothes")
         .select("id, wear_count")
         .in_("id", clothes_ids)
         .eq("user_id", user_id)
         .execute()
      )

      for cloth in worn.data:
         new_count = (cloth.get("wear_count") or 0) + 1
         supabase.table("clothes").update({
            "wear_count":   new_count,
            "last_worn_at": now
         }).eq("id", cloth["id"]).execute()

   except Exception:
      pass  # não bloqueia o salvamento do look se falhar

@router.get("/")
def list_saved_looks(
   user=Depends(get_current_user),
   limit: int = 20,
   offset: int = 0
):
   looks_result = (
      supabase.table("looks")
      .select("*")
      .eq("user_id", user.id)
      .eq("saved", True)
      .order("created_at", desc=True)
      .range(offset, offset + limit - 1)
      .execute()
   )
   looks = looks_result.data

   # busca todas as peças de uma vez
   all_ids = list(set(id for look in looks for id in look.get("clothes_ids", [])))

   clothes_map = {}
   if all_ids:
      clothes_result = supabase.table("clothes").select("*").in_("id", all_ids).execute()
      clothes_map    = {c["id"]: c for c in clothes_result.data}

   for look in looks:
      look["clothes"] = [clothes_map[id] for id in look.get("clothes_ids", []) if id in clothes_map]

   return looks

@router.post("/plan")
def plan_look(data: PlanRequest, user=Depends(get_current_user)):
   # confere que o look é do próprio usuário antes de agendar
   look = (
      supabase.table("looks")
      .select("id")
      .eq("id", data.look_id)
      .eq("user_id", user.id)
      .execute()
   )
   if not look.data:
      raise HTTPException(status_code=404, detail="Look não encontrado")

   # um look por dia: se já tinha algo agendado nessa data, substitui
   row = {"user_id": user.id, "look_id": data.look_id, "date": data.date}
   result = supabase.table("planned_looks").upsert(row, on_conflict="user_id,date").execute()
   return result.data[0]

@router.get("/planned")
def list_planned(user=Depends(get_current_user)):
   planned = (
      supabase.table("planned_looks")
      .select("*")
      .eq("user_id", user.id)
      .order("date")
      .execute()
   )
   rows = planned.data

   if not rows:
      return []

   # busca os looks agendados e popula com as peças, de uma vez só
   look_ids  = list({r["look_id"] for r in rows})
   looks_res = supabase.table("looks").select("*").in_("id", look_ids).execute()

   clothes_ids = list({cid for lk in looks_res.data for cid in lk.get("clothes_ids", [])})
   clothes_map = {}
   if clothes_ids:
      cres        = supabase.table("clothes").select("*").in_("id", clothes_ids).execute()
      clothes_map = {c["id"]: c for c in cres.data}

   for lk in looks_res.data:
      lk["clothes"] = [clothes_map[i] for i in lk.get("clothes_ids", []) if i in clothes_map]

   looks_map = {lk["id"]: lk for lk in looks_res.data}
   for r in rows:
      r["look"] = looks_map.get(r["look_id"])

   return rows

@router.delete("/planned/{plan_id}")
def delete_planned(plan_id: str, user=Depends(get_current_user)):
   supabase.table("planned_looks").delete().eq("id", plan_id).eq("user_id", user.id).execute()
   return {"deleted": True}