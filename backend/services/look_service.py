import re
import unicodedata

# Descobre quais peças do armário a Mira citou numa resposta de chat.
#
# A ideia central: em vez de pedir os ids ao modelo, que custaria tokens de prompt e traria
# risco de formato quebrado no meio da conversa, a gente procura as peças dentro do texto
# que ele já escreveu. Isso funciona porque o prompt da Mira manda ela citar as peças pelo
# tipo e pela cor, que são exatamente as duas colunas que a tabela clothes tem. Nenhuma
# chamada de IA a mais, e nada que o modelo possa formatar errado.

# Mesmo mapa de zonas do frontend (ZONE_KEYWORDS no looks.js), sem acento porque aqui o
# texto já chega normalizado. Ele mora nos dois lugares porque o frontend precisa dele pra
# desenhar a colagem e o backend precisa dele pra saber se a resposta descreve um look ou
# só comenta uma peça de passagem. Se mexer aqui, mexa lá também.
ZONAS = {
   "shoes":     ["tenis", "sapato", "sandalia", "chinelo", "bota", "sapatilha", "rasteira",
                 "salto", "mocassim", "tamanco", "slide", "scarpin"],
   "bag":       ["bolsa", "mochila", "carteira", "clutch", "pochete", "necessaire"],
   "accessory": ["colar", "anel", "brinco", "pulseira", "oculos", "chapeu", "cinto",
                 "lenco", "relogio", "bone", "gorro", "tiara", "presilha", "bracelete",
                 "corrente", "choker"],
   "bottom":    ["calca", "saia", "short", "bermuda", "legging", "pantalona", "jeans",
                 "calcao"],
   "full":      ["vestido", "macacao", "macaquinho", "jardineira"],
   "top":       ["camiseta", "camisa", "blusa", "top", "cropped", "regata", "moletom",
                 "casaco", "jaqueta", "blazer", "sueter", "trico", "tricot", "cardiga",
                 "colete", "body", "bata"],
}

# A ordem importa e é a mesma do frontend: calçado e acessório são testados antes de "top"
# pra não caírem no genérico.
ORDEM_ZONAS = ["shoes", "bag", "accessory", "bottom", "full", "top"]

# Vestido e camisa são zonas diferentes mas disputam o MESMO espaço da colagem, o de cima.
# Contar vaga por zona deixaria os dois entrarem juntos e um deles seria descartado depois,
# em silêncio. Por isso a contagem é por espaço.
def _espaco(zona: str) -> str:
   return "top" if zona in ("top", "full") else zona

# Quantos cabem em cada espaço: um de cada, menos acessório, que tem três lugares na
# colagem. Cortar aqui deixa a sugestão sempre desenhável do outro lado.
VAGAS = {"top": 1, "bottom": 1, "shoes": 1, "bag": 1, "accessory": 3}

# Distância máxima, em caracteres, entre o tipo e a cor pra contar como a mesma peça. Sem
# isso, "camisa branca com a calça azul" casaria com uma "camisa azul" do armário, porque
# as duas palavras aparecem no texto, só que longe uma da outra.
JANELA_TIPO_COR = 28

# A janela também para no fim da oração, senão ela invade a peça seguinte: em "o moletom e
# a bota marrom", o "marrom" cairia dentro da janela do moletom e a gente concluiria que a
# pessoa citou uma cor que não é a dele.
FIM_DE_ORACAO = re.compile(r"[,.;:!?]|\se\s|\scom\s|\sou\s|\smais\s")


def _normalizar(texto: str) -> str:
   """Minúsculas e sem acento, pra "óculos" no banco casar com "oculos" no texto."""
   sem_acento = unicodedata.normalize("NFD", (texto or "").lower())
   return "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")


def _palavra(termo: str) -> str:
   """Regex que casa o termo como palavra inteira, tolerando plural e a flexão de gênero.

   Os limites são obrigatórios: sem eles um tipo curto como "top" apareceria dentro de
   outras palavras e casaria peça que ninguém citou.

   A flexão importa mais do que parece. A IA grava a cor no masculino ("branco", "preto"),
   mas a Mira escreve concordando com a peça ("camisa branca", "bota preta"). Sem tratar
   isso, as cores mais comuns do armário simplesmente nunca casariam. Mesma coisa com o
   plural, em "as botas marrons"."""
   if len(termo) > 3 and termo.endswith("m"):
      corpo = re.escape(termo[:-1]) + "(?:m|ns)"   # marrom, marrons
   elif len(termo) > 3 and termo.endswith("l"):
      corpo = re.escape(termo[:-1]) + "(?:l|is)"   # azul, azuis
   elif len(termo) > 3 and termo[-1] in "oa":
      corpo = re.escape(termo[:-1]) + "[oa]s?"     # branco, branca, brancas
   else:
      corpo = re.escape(termo) + "s?"              # bege, beges
   return rf"(?<![a-z0-9]){corpo}(?![a-z0-9])"


def _janela(texto: str, fim_do_tipo: int) -> str:
   """O trecho logo depois do tipo onde a cor ainda conta como sendo da mesma peça,
   cortado no fim da oração."""
   trecho = texto[fim_do_tipo: fim_do_tipo + JANELA_TIPO_COR]
   corte  = FIM_DE_ORACAO.search(trecho)
   return trecho[:corte.start()] if corte else trecho


def zona_de(tipo: str) -> str:
   """Em que zona a peça se encaixa. Sem correspondência vira parte de cima, igual ao
   frontend."""
   t = _normalizar(tipo)
   for zona in ORDEM_ZONAS:
      if any(palavra in t for palavra in ZONAS[zona]):
         return zona
   return "top"


def _candidatas(texto: str, pecas: list) -> list:
   """Peças do armário que aparecem no texto, ainda sem cortar por espaço."""
   cores_do_armario = {_normalizar(p.get("color")) for p in pecas if p.get("color")}
   achadas = []

   for peca in pecas:
      tipo = _normalizar(peca.get("type"))
      cor  = _normalizar(peca.get("color"))
      if not tipo:
         continue

      ocorrencias = list(re.finditer(_palavra(tipo), texto))
      if not ocorrencias:
         continue

      # A cor precisa vir logo depois do tipo pra ser a mesma peça. Em português a cor vem
      # depois do substantivo ("camisa azul"), e a janela dá folga pro que vier no meio,
      # como em "camisa de linho azul".
      janelas = [_janela(texto, o.end()) for o in ocorrencias]

      if cor and any(re.search(_palavra(cor), j) for j in janelas):
         achadas.append(peca)
         continue

      # Chegou aqui: a Mira citou o tipo mas não essa cor. Só dá pra assumir que é esta
      # peça se ela não tiver dito cor NENHUMA, porque "camisa branca" com um armário que
      # só tem camisa azul não é a camisa azul, é uma peça que a pessoa não tem.
      citou_outra_cor = any(
         re.search(_palavra(outra), j)
         for j in janelas for outra in cores_do_armario if outra
      )
      if citou_outra_cor:
         continue

      # Sem cor no texto, só vale quando não há dúvida: uma peça só desse tipo no armário.
      if sum(1 for p in pecas if _normalizar(p.get("type")) == tipo) == 1:
         achadas.append(peca)

   return achadas


def _desempatar(candidatas: list) -> list:
   """Duas peças do mesmo tipo e mesma cor são indistinguíveis no texto: quando a Mira diz
   "camiseta branca" e existem duas, não dá pra saber qual. A escolhida é a mais usada,
   porque é a que a pessoa de fato veste, e o id entra como critério final pra escolha ser
   sempre a mesma de uma conversa pra outra, em vez de depender da ordem que o banco
   devolveu."""
   return sorted(
      candidatas,
      key=lambda p: (-(p.get("wear_count") or 0), str(p.get("id")))
   )


# A linha que a Mira escreve quando está de fato sugerindo um look. O prefixo aceita
# marcação de markdown na frente porque o modelo às vezes escreve "**Look:**".
LINHA_LOOK = re.compile(r"^[ \t*_#>-]*look\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)

# A linha que ela escreve quando quer que o app mostre a foto de UMA peça específica, em vez
# de um look inteiro. Mesma ideia da LINHA_LOOK e pelo mesmo motivo: quem sabe se aquilo é um
# ponteiro pra uma peça ou só uma menção de passagem é ela, não a gente.
#
# Aceita "peça" e "peca" porque o modelo às vezes escorrega no acento.
#
# São duas formas de achar a marcação, e elas têm confiança diferente.
#
# A primeira é a linha própria, que é como o prompt pede. Não tem como confundir com prosa,
# então ela pode sair do texto sempre.
#
# A segunda é a marcação colada no fim do último parágrafo, que foi medido acontecendo: ela
# escreveu "... ou ajustar num alfaiate. Peça: calça preta" tudo na mesma linha, e sem isso
# a marcação aparecia crua na tela. Aqui a confiança é menor, porque "peça" também é verbo
# em português, e na MESMA resposta apareceu "peça pra dobrar a barra". Por isso essa forma
# exige três coisas juntas: vir depois de um ponto final, ter os dois pontos logo em seguida,
# e ser a última coisa da mensagem.
LINHA_PECA = re.compile(r"^[ \t*_#>-]*pe[çc]a\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
CAUDA_PECA = re.compile(r"(?:(?<=[.!?])|\A)\s*pe[çc]a\s*:\s*([^\n]+?)\s*\Z", re.IGNORECASE)

# Quantas peças a marcação mostra por mensagem, e o número não é chute. Medindo o casamento
# por texto em respostas reais, a Mira cita de cinco a sete peças por mensagem quando está
# explicando alguma coisa. Foto pra tudo isso vira poluição, que foi exatamente o motivo de
# não casar a prosa inteira. Duas mantém a marcação como ponteiro, não como catálogo.
MAX_PECAS_CITADAS = 2


def separar_linha_peca(resposta: str):
   """Separa a linha "Peça: ..." do resto da mensagem.

   Diferente da linha do Look, esta SEMPRE sai do texto, tenha casado peça ou não. A do Look
   sobrevive quando não casa porque ela é uma lista legível, que funciona como resumo
   escrito. Já um "Peça: calça preta" solto no fim da conversa não acrescenta nada: a peça
   já foi citada na frase logo acima, então a linha só leria como marcação vazando pra tela.

   Devolve (trecho, resposta_sem_a_marcação, corte_seguro).

   O corte_seguro diz se dá pra tirar a marcação do texto mesmo quando ela não casar peça
   nenhuma. Marcação em linha própria é inconfundível e sai sempre. Marcação colada no fim
   do parágrafo pode ser frase de verdade ("Escolha a peça: a preta ou a oliva"), então ela
   só deve sair quando casar, e quem decide isso é quem chama.

   Sem marcação nenhuma, devolve (None, resposta, True).
   """
   achados = list(LINHA_PECA.finditer(resposta or ""))
   if achados:
      ultimo = achados[-1]
      trecho = ultimo.group(1).strip(" *_")
      limpa  = (resposta[:ultimo.start()] + resposta[ultimo.end():]).strip()

      # Mensagem que era só a marcação deixaria a bolha vazia. Aqui a saída é diferente da
      # linha do Look: em vez de devolver a resposta inteira, que mostraria o prefixo
      # "Peça:" cru na tela, devolve só o nome da peça. A bolha fica com "calça preta" e a
      # foto entra logo abaixo, que é o que a marcação queria dizer de qualquer jeito.
      return trecho, (limpa or trecho), True

   cauda = CAUDA_PECA.search(resposta or "")
   if cauda:
      trecho = cauda.group(1).strip(" *_")
      limpa  = resposta[:cauda.start()].strip()
      return trecho, (limpa or trecho), False

   return None, resposta, True


def encontrar_pecas_citadas(trecho: str, pecas: list) -> list:
   """Devolve as peças do armário que a Mira marcou, no máximo MAX_PECAS_CITADAS.

   Reusa o mesmo casamento da sugestão de look, então peça que a pessoa não tem simplesmente
   não casa e não aparece, sem precisar de validação separada.

   A diferença pro encontrar_look_citado é que aqui não existe regra de espaço nem mínimo de
   duas peças: uma peça sozinha é justamente o caso que esta marcação serve pra cobrir.
   """
   if not trecho or not pecas:
      return []

   texto      = _normalizar(trecho)
   candidatas = _desempatar(_candidatas(texto, pecas))

   # Duas peças de mesmo tipo e mesma cor são indistinguíveis no texto e mostrariam duas
   # fotos iguais lado a lado. O _desempatar já pôs a mais usada na frente, então basta
   # ficar com a primeira de cada par tipo mais cor.
   vistos, escolhidas = set(), []
   for p in candidatas:
      chave = (_normalizar(p.get("type")), _normalizar(p.get("color")))
      if chave in vistos:
         continue
      vistos.add(chave)
      escolhidas.append(p)

   # Ordena pela posição em que cada peça aparece na linha, e não pela ordem do armário.
   # Isso importa por causa do corte logo abaixo: quando ela marca três peças, as duas que
   # ficam devem ser as duas que ela escreveu primeiro, porque a escolha é dela. Sem isto o
   # corte saía na ordem do _desempatar, que é por uso, e podia descartar justamente a peça
   # que a frase estava comentando.
   def _posicao(peca):
      achado = re.search(_palavra(_normalizar(peca.get("type"))), texto)
      return achado.start() if achado else len(texto)

   escolhidas.sort(key=_posicao)

   return escolhidas[:MAX_PECAS_CITADAS]


def separar_linha_look(resposta: str):
   """Separa a linha "Look: ..." do resto da mensagem.

   Ela existe porque casar peça no texto inteiro não distingue intenção: medindo com
   respostas reais, a Mira comentando uma bota escreveu "fica perfeita junto com a calça
   preta e a camisa azul", que são três peças em três espaços diferentes, coladas uma na
   outra. Nenhuma regra de quantidade ou de distância separa isso de uma sugestão de
   verdade, porque as duas frases têm a mesma forma.

   Com a linha, quem diz se aquilo é sugestão é a Mira, que é quem sabe. E o custo disso é
   uma frase no prompt, não uma chamada de IA a mais nem um JSON que ela possa quebrar: se
   ela esquecer a linha, a gente só não mostra a sugestão.

   Devolve (trecho_do_look, resposta_sem_a_linha). Sem a linha, devolve (None, resposta).
   """
   achados = list(LINHA_LOOK.finditer(resposta or ""))
   if not achados:
      return None, resposta

   ultimo = achados[-1]

   # O modelo às vezes escreve "**Look:** camisa azul", e aí o fecho do negrito vem
   # colado no começo do trecho capturado.
   trecho = ultimo.group(1).strip(" *_")
   limpa  = (resposta[:ultimo.start()] + resposta[ultimo.end():]).strip()

   # Resposta que era só a linha do Look deixaria a bolha vazia. Nesse caso ela fica onde
   # está, porque uma lista escrita é melhor que um balão em branco.
   if not limpa:
      return trecho, resposta

   return trecho, limpa


def encontrar_look_citado(resposta: str, pecas: list) -> list:
   """Devolve as peças que a resposta sugere como look, ou lista vazia.

   Vazia quando a resposta não descreve um look: exige pelo menos duas peças em espaços
   diferentes da colagem. É isso que separa "que tal a camisa azul com a calça preta", que
   é sugestão, de "essa camisa azul é linda", que é comentário sobre uma peça só.
   """
   if not resposta or not pecas:
      return []

   texto = _normalizar(resposta)
   candidatas = _desempatar(_candidatas(texto, pecas))

   escolhidas, ocupados = [], {}
   for peca in candidatas:
      espaco = _espaco(zona_de(peca.get("type")))
      if ocupados.get(espaco, 0) >= VAGAS[espaco]:
         continue
      ocupados[espaco] = ocupados.get(espaco, 0) + 1
      escolhidas.append(peca)

   # Vestido e macacão ocupam o centro sozinhos, então a parte de baixo sai. Mesma regra do
   # topIsFull no frontend.
   if any(zona_de(p.get("type")) == "full" for p in escolhidas):
      escolhidas = [p for p in escolhidas if zona_de(p.get("type")) != "bottom"]
      ocupados.pop("bottom", None)

   if len(escolhidas) < 2 or len(ocupados) < 2:
      return []

   return escolhidas