// Espaços que o look pode ter. A ordem aqui é a ordem que as peças entram no look salvo,
// e o "zone" diz que tipo de peça cabe em cada um. Acessório tem três lugares.
//
// Não existe mais um campo de posição no quadro: a colagem monta o arranjo a partir do que
// foi escolhido, em vez de encaixar cada peça num lugar fixo do grid.
const LOOK_SLOTS = [
   { key: 'top',    zone: 'top',       hint: 'parte de cima' },
   { key: 'bottom', zone: 'bottom',    hint: 'parte de baixo' },
   { key: 'shoes',  zone: 'shoes',     hint: 'calçado' },
   { key: 'bag',    zone: 'bag',       hint: 'bolsa' },
   { key: 'acc1',   zone: 'accessory', hint: 'acessório' },
   { key: 'acc2',   zone: 'accessory', hint: 'acessório' },
   { key: 'acc3',   zone: 'accessory', hint: 'acessório' },
]

// A IA guarda o tipo da peça como texto livre (camiseta, saia, tênis...).
// Aqui a gente descobre em qual espaço da colagem a peça se encaixa a partir
// dessas palavras. Não precisa ser perfeito, só cobrir os casos mais comuns.
const ZONE_KEYWORDS = {
   shoes:     ['tênis', 'tenis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'bota', 'sapatilha', 'rasteira', 'salto', 'mocassim', 'tamanco', 'slide', 'scarpin'],
   bag:       ['bolsa', 'mochila', 'carteira', 'clutch', 'pochete', 'necessaire'],
   accessory: ['colar', 'anel', 'brinco', 'pulseira', 'óculos', 'oculos', 'chapéu', 'chapeu', 'cinto', 'lenço', 'lenco', 'relógio', 'relogio', 'boné', 'bone', 'gorro', 'tiara', 'presilha', 'bracelete', 'corrente', 'choker'],
   bottom:    ['calça', 'calca', 'saia', 'short', 'bermuda', 'legging', 'pantalona', 'jeans', 'calção', 'calcao'],
   // peças de corpo inteiro: ocupam o centro sozinhas, sem parte de baixo separada
   full:      ['vestido', 'macacão', 'macacao', 'macaquinho', 'jardineira'],
   top:       ['camiseta', 'camisa', 'blusa', 'top', 'cropped', 'regata', 'moletom', 'casaco', 'jaqueta', 'blazer', 'suéter', 'sueter', 'tricô', 'tricot', 'cardigã', 'cardiga', 'colete', 'body', 'bata'],
}

// Ordem de teste importa: calçado e acessório antes de top pra não cair no genérico.
function zoneOf(type) {
   const t = (type || '').toLowerCase()
   for (const zone of ['shoes', 'bag', 'accessory', 'bottom', 'full', 'top']) {
      if (ZONE_KEYWORDS[zone].some(word => t.includes(word))) return zone
   }
   // sem correspondência, trata como parte de cima
   return 'top'
}

// Decide o que vai grande no meio do look e como os extras se espalham em volta dele.
//
// Mora aqui, fora do desenho, porque dois lugares precisam da MESMA decisão e desenham de
// jeitos diferentes: a colagem da aba Montar monta elementos no DOM, e o compartilhar
// pinta num canvas com coordenadas em pixel. O que dá pra compartilhar entre os dois é a
// escolha, não o traço.
//
// Recebe itens no formato { cloth, slot }, e devolve os mesmos itens separados. O slot vem
// junto porque a colagem precisa saber em que espaço a peça está pra abrir a folha certa
// quando alguém tocar nela; o compartilhar simplesmente ignora esse campo.
//
// Os extras não vão mais numa fileira embaixo do centro. Eles se dividem em duas calhas,
// uma de cada lado. Isso mudou por dois motivos medidos: com três ou mais, a fileira
// espremia todos lado a lado e a colagem perdia o ar de composição; e ela comia 26% da
// altura do quadro, então acrescentar um colar encolhia a roupa de 179 por 238 pra 128 por
// 170. Com as calhas o centro tem a mesma altura sempre, tenha o look duas peças ou sete.
//
// Quem escolhe o lado é a POSIÇÃO na lista, não o tipo da peça. Nada fica reservado
// esperando bolsa aparecer: se o look não tem calçado, quem for o primeiro extra assume o
// lugar que seria dele.
function arranjoDoLook(itens) {
   const porZona = { full: [], top: [], bottom: [], shoes: [], bag: [], accessory: [] }
   itens.forEach(item => (porZona[zoneOf(item.cloth.type)] || porZona.accessory).push(item))

   // vestido e macacão ocupam o centro sozinhos e dispensam a parte de baixo
   const principal = porZona.full.length
      ? porZona.full.slice(0, 1)
      : [...porZona.top.slice(0, 1), ...porZona.bottom.slice(0, 1)]

   const extras = [
      ...porZona.shoes.slice(0, 1),
      ...porZona.bag.slice(0, 1),
      // três porque são três espaços de acessório no LOOK_SLOTS. O corte é só uma trava
      // pra look salvo com dado estranho, não uma escolha de layout.
      ...porZona.accessory.slice(0, 3),
   ]

   // Quando o centro tem uma peça só, os extras vão todos pra uma calha, à direita.
   //
   // Isso não é capricho, é medida. Peça de corpo inteiro é alta e usa o quadro inteiro,
   // então ela é limitada pela LARGURA do centro. Com calha dos dois lados o centro cai pra
   // 179px e o vestido sai com 179 de largura, MENOR do que os 263 que ele tinha na fileira
   // antiga. Com uma calha só o centro fica em 268 e o vestido sai com 268, maior do que
   // era. Duas calhas valem a pena quando o centro tem duas peças empilhadas, porque aí
   // cada caixa é limitada pela altura e a largura sobrando não seria aproveitada mesmo.
   const umaCalha = principal.length < 2

   // Alterna os lados começando pela direita. O primeiro extra costuma ser o calçado, e
   // calçado embaixo à direita é onde o olho vai procurar. Daí em diante é revezamento
   // simples, então cada lado sempre fica com metade, ou com uma peça de diferença.
   const direita  = umaCalha ? extras : extras.filter((_, i) => i % 2 === 0)
   const esquerda = umaCalha ? []     : extras.filter((_, i) => i % 2 === 1)

   return { principal, extras, esquerda, direita }
}

const LooksPage = {
   // Ids que a Mira sugeriu no chat, esperando a aba Montar carregar. Repare que ela NÃO
   // é zerada no init(): quem escreve aqui é o chat, logo antes de chamar navigate('looks'),
   // e o init roda depois disso. Zerar ali apagaria a sugestão no caminho.
   sugestaoPendente: null,

   currentLook:  null,
   activeMode:   'casual',
   _savedLooks:  [],
   _offset:      0,
   _limit:       20,
   _hasMore:     false,
   _loading:     false,

   // construtor manual (colagem)
   activeTab:     'build',       // 'build' | 'ai'
   buildMode:     'casual',
   _buildClothes: [],
   _slots:        {},            // slot.key -> id da peça
   _pickerSlot:   null,          // slot aberto na folha de seleção

   render() {
      return `
         <div class="page">
            <div class="page-header">
               <h1 class="page-title">Looks</h1>
               <p class="page-subtitle">Monte o seu ou deixe a IA sugerir</p>
            </div>

            <div class="look-tabs">
               <button class="look-tab active" data-tab="build">Montar</button>
               <button class="look-tab" data-tab="ai">Gerar IA</button>
               <button class="look-tab" data-tab="plan">Planejar</button>
            </div>

            <div id="build-view">
               <div class="mode-bar" id="build-mode-bar">
                  <button class="mode-pill active" data-bmode="casual">Casual</button>
                  <button class="mode-pill" data-bmode="elegante">Elegante</button>
                  <button class="mode-pill" data-bmode="trabalho">Trabalho</button>
                  <button class="mode-pill" data-bmode="festa">Festa</button>
               </div>

               <div class="look-canvas" id="look-canvas"></div>

               <button class="btn-secondary build-add" id="build-add">Adicionar peça</button>

               <div class="build-actions" id="build-actions">
                  <button class="btn-secondary" id="build-shuffle">Embaralhar look</button>
                  <button class="btn-primary" id="build-save">Salvar look</button>
               </div>
            </div>

            <div id="ai-view" class="hidden">
               <div class="mode-bar">
                  <button class="mode-pill active" data-mode="casual">Casual</button>
                  <button class="mode-pill" data-mode="elegante">Elegante</button>
                  <button class="mode-pill" data-mode="trabalho">Trabalho</button>
                  <button class="mode-pill" data-mode="festa">Festa</button>
               </div>
               <button class="btn-primary" id="generate-btn">Gerar look</button>
               <div id="look-result" class="look-result hidden"></div>
            </div>

            <div id="plan-view" class="hidden">
               <div id="planned-list"></div>
            </div>

            <div id="saved-looks" class="saved-looks"></div>
         </div>

         <div class="picker-sheet hidden" id="picker-sheet">
            <div class="picker-backdrop" id="picker-backdrop"></div>
            <div class="picker-panel">
               <div class="picker-header">
                  <span id="picker-title">Escolher peça</span>
                  <button class="picker-close" id="picker-close" aria-label="Fechar">×</button>
               </div>
               <div class="picker-grid" id="picker-grid"></div>
            </div>
         </div>

         <div class="picker-sheet hidden" id="look-detail">
            <div class="picker-backdrop" id="detail-backdrop"></div>
            <div class="picker-panel">
               <div class="picker-header">
                  <span id="detail-title">Look</span>
                  <button class="picker-close" id="detail-close" aria-label="Fechar">×</button>
               </div>
               <div id="detail-body"></div>
               <button class="btn-secondary detail-share" id="detail-share">Compartilhar look</button>
               <div class="detail-plan">
                  <input type="date" id="plan-date">
                  <button class="btn-primary" id="plan-btn">Planejar pra esse dia</button>
               </div>
            </div>
         </div>
      `
   },

   async init() {
      this.currentLook   = null
      this.activeMode    = 'casual'
      this.activeTab     = 'build'
      this.buildMode     = 'casual'
      this._savedLooks   = []
      this._offset       = 0
      this._hasMore      = false
      this._buildClothes = []
      this._slots        = {}
      this._pickerSlot   = null
      this._ignorarProximoClique = false
      this._planned      = []
      this._detailLookId = null
      this._detailLook   = null

      // troca de abas (Montar / IA / Planejar)
      document.querySelectorAll('.look-tab').forEach(tab => {
         tab.addEventListener('click', () => this.switchTab(tab.dataset.tab))
      })

      // modo do look manual e do look da IA
      this.bindModeBar('#build-mode-bar', 'buildMode', 'bmode')
      this.bindModeBar('#ai-view', 'activeMode', 'mode')

      document.getElementById('generate-btn').addEventListener('click', () => this.generate())
      document.getElementById('build-shuffle').addEventListener('click', () => this.shuffleLook())
      document.getElementById('build-add').addEventListener('click', () => this.abrirEscolha({}))
      document.getElementById('build-save').addEventListener('click', () => this.saveManualLook())

      // fechar a folha de seleção tocando fora ou no X
      document.getElementById('picker-close').addEventListener('click', () => this.closePicker())
      document.getElementById('picker-backdrop').addEventListener('click', () => this.closePicker())

      // fechar o detalhe do look salvo
      document.getElementById('detail-close').addEventListener('click', () => this.closeLookDetail())
      document.getElementById('detail-backdrop').addEventListener('click', () => this.closeLookDetail())

      // agendar o look aberto no detalhe pra uma data
      document.getElementById('plan-btn').addEventListener('click', () => this.planLook())

      // gerar uma imagem do look pra compartilhar
      document.getElementById('detail-share').addEventListener('click', () => this.shareLook())

      await Promise.all([this.loadBuildClothes(), this.loadSavedLooks()])
   },

   bindModeBar(scopeSelector, stateKey, dataAttr) {
      document.querySelectorAll(`${scopeSelector} .mode-pill`).forEach(pill => {
         pill.addEventListener('click', () => {
            this[stateKey] = pill.dataset[dataAttr]
            document.querySelectorAll(`${scopeSelector} .mode-pill`).forEach(p => p.classList.remove('active'))
            pill.classList.add('active')
         })
      })
   },

   switchTab(tab) {
      this.activeTab = tab
      document.querySelectorAll('.look-tab').forEach(t => {
         t.classList.toggle('active', t.dataset.tab === tab)
      })
      document.getElementById('build-view').classList.toggle('hidden', tab !== 'build')
      document.getElementById('ai-view').classList.toggle('hidden', tab !== 'ai')
      document.getElementById('plan-view').classList.toggle('hidden', tab !== 'plan')

      if (tab === 'plan') this.loadPlanned()
   },

   // ============ CONSTRUTOR MANUAL (COLAGEM) ============

   async loadBuildClothes() {
      const response = await API.get('/clothes/?limit=100&offset=0')
      if (!response) return

      this._buildClothes = response.ok ? await response.json() : []

      const canvas  = document.getElementById('look-canvas')
      const actions = document.getElementById('build-actions')

      if (this._buildClothes.length === 0) {
         canvas.classList.add('look-canvas-empty')
         canvas.innerHTML = `
            <div class="empty-state" style="grid-column:unset">
               <p>Seu armário está vazio</p>
               <span>Adicione peças no Armário para montar seus looks</span>
            </div>
         `
         actions.classList.add('hidden')
         return
      }

      // Veio de uma sugestão da Mira? Então monta ela. Sem sugestão pendente, segue o
      // comportamento de sempre, que é abrir com um look sorteado.
      if (this.sugestaoPendente) {
         this.aplicarSugestao(this.sugestaoPendente)
         this.sugestaoPendente = null
         return
      }

      // já abre com um look montado, pra pessoa ver a colagem pronta
      this.shuffleLook()
   },

   // Coloca as peças sugeridas nos espaços da colagem. O backend já manda no máximo uma
   // peça por espaço, mas a checagem de espaço livre fica aqui do mesmo jeito, porque a
   // sugestão pode ter vindo de uma conversa antiga e o armário pode ter mudado desde lá.
   aplicarSugestao(ids) {
      const byId  = Object.fromEntries(this._buildClothes.map(c => [c.id, c]))
      this._slots = {}

      ids.forEach(id => {
         // peça apagada do armário depois que a Mira sugeriu: simplesmente não entra
         if (!byId[id]) return

         const slot = LOOK_SLOTS.find(s =>
            !this._slots[s.key] && this.piecesForSlot(s).some(c => c.id === id)
         )
         if (slot) this._slots[slot.key] = id
      })

      // vestido ou macacão no centro dispensa a parte de baixo, igual ao sorteio
      if (this.topIsFull()) this._slots.bottom = null

      this.renderCanvas()
   },

   // Tira a peça do look. Os dois caminhos (toque longo e o botão da folha) chegam aqui.
   removerDoLook(slotKey) {
      if (!this._slots[slotKey]) return
      this._slots[slotKey] = null
      this.renderCanvas()
      showToast('Peça tirada do look')
   },

   // Toque longo no celular, botão direito no computador.
   //
   // Três detalhes que decidem se isso funciona ou irrita:
   //
   //  - Movimento de mais de 8px cancela. Sem isso, rolar a página com o dedo em cima de
   //    uma peça tiraria ela do look sem querer.
   //  - O clique que o navegador dispara depois do toque longo precisa ser engolido, senão
   //    a folha de escolha abriria logo em cima da remoção. A trava fica na página e não no
   //    elemento, porque o renderCanvas troca o DOM inteiro no meio do caminho e o elemento
   //    que recebeu o toque já não existe quando o clique chega.
   //  - O menu do sistema tem que ser bloqueado: no Android o toque longo abre o menu de
   //    contexto e no iOS oferece salvar a imagem, os dois por cima do gesto.
   ligarRemocao(el) {
      const LIMITE_MS = 500
      const TOLERANCIA_PX = 8
      let timer  = null
      let inicio = null

      const cancelar = () => { clearTimeout(timer); timer = null }

      el.addEventListener('pointerdown', (e) => {
         if (e.button === 2) return   // botão direito tem caminho próprio, no contextmenu
         inicio = { x: e.clientX, y: e.clientY }
         timer  = setTimeout(() => {
            timer = null
            this._ignorarProximoClique = true
            setTimeout(() => { this._ignorarProximoClique = false }, 400)
            this.removerDoLook(el.dataset.slot)
         }, LIMITE_MS)
      })

      el.addEventListener('pointermove', (e) => {
         if (!timer || !inicio) return
         if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > TOLERANCIA_PX) cancelar()
      })

      ;['pointerup', 'pointercancel', 'pointerleave'].forEach(evento =>
         el.addEventListener(evento, cancelar))

      el.addEventListener('contextmenu', (e) => {
         e.preventDefault()
         this.removerDoLook(el.dataset.slot)
      })
   },

   // Decide sozinho em que espaço a peça entra, a partir do tipo. Usado quando a escolha
   // veio do botão de adicionar, em que a pessoa não apontou um lugar.
   //
   // Zona de um espaço só (cima, baixo, calçado, bolsa) substitui o que estiver lá.
   // Acessório vai pro primeiro dos três livres e, com os três ocupados, troca o primeiro:
   // é o comportamento menos surpreendente, porque a pessoa vê a troca acontecer na hora.
   encaixar(id) {
      const cloth = this._buildClothes.find(c => c.id === id)
      if (!cloth) return

      // a mesma peça não pode ficar em dois lugares do mesmo look
      LOOK_SLOTS.forEach(s => { if (this._slots[s.key] === id) this._slots[s.key] = null })

      const zona = zoneOf(cloth.type)

      if (zona === 'accessory') {
         const chaves = LOOK_SLOTS.filter(s => s.zone === 'accessory').map(s => s.key)
         this._slots[chaves.find(k => !this._slots[k]) || chaves[0]] = id
         return
      }

      if (zona === 'full') {
         // vestido e macacão ocupam o centro e dispensam a parte de baixo
         this._slots.top    = id
         this._slots.bottom = null
         return
      }

      const alvo = LOOK_SLOTS.find(s => s.zone === zona)
      if (alvo) this._slots[alvo.key] = id
   },

   // peças do armário que cabem numa zona (parte de cima, calçado, etc.)
   piecesInZone(zone) {
      return this._buildClothes.filter(c => zoneOf(c.type) === zone)
   },

   // o que cabe em cada espaço. A parte de cima aceita também peça de corpo inteiro (vestido).
   piecesForSlot(slot) {
      if (slot.key === 'top') {
         return this._buildClothes.filter(c => ['top', 'full'].includes(zoneOf(c.type)))
      }
      return this.piecesInZone(slot.zone)
   },

   // a parte de cima está com uma peça de corpo inteiro? (aí não usa a parte de baixo)
   topIsFull() {
      const cloth = this._buildClothes.find(c => c.id === this._slots.top)
      return cloth ? zoneOf(cloth.type) === 'full' : false
   },

   // sorteia uma peça pra cada espaço, sem repetir a mesma peça em dois lugares
   // Sorteia um look plausível, não um look cheio.
   //
   // Antes enchia os sete espaços, o que fazia sentido quando os vazios apareciam como
   // contorno tracejado: o quadro já estava desenhado de qualquer jeito. Agora que a
   // colagem mostra só o que foi escolhido, abrir a aba com sete peças e ter que tirar
   // cinco é o oposto de começar um look. Então sai o núcleo, que é o que veste uma
   // pessoa, mais um extra pro sorteio não sair sempre igual.
   shuffleLook() {
      const usadas = new Set()
      this._slots  = {}

      const espaco  = (chave) => LOOK_SLOTS.find(s => s.key === chave)
      const sortear = (slot) => {
         const opcoes = this.piecesForSlot(slot).filter(c => !usadas.has(c.id))
         if (opcoes.length === 0) return
         const escolha = opcoes[Math.floor(Math.random() * opcoes.length)]
         this._slots[slot.key] = escolha.id
         usadas.add(escolha.id)
      }

      sortear(espaco('top'))
      // com vestido ou macacão em cima, a parte de baixo fica de fora
      if (!this.topIsFull()) sortear(espaco('bottom'))
      sortear(espaco('shoes'))

      const extras = ['bag', 'acc1'].filter(k => this.piecesForSlot(espaco(k)).length > 0)
      if (extras.length) sortear(espaco(extras[Math.floor(Math.random() * extras.length)]))

      this.renderCanvas()
   },

   renderCanvas() {
      const canvas = document.getElementById('look-canvas')
      canvas.classList.remove('look-canvas-empty')

      // Só as peças escolhidas. Espaço vazio não é desenhado: quem diz onde dá pra pôr
      // coisa agora é o botão de adicionar, embaixo da colagem.
      const byId  = Object.fromEntries(this._buildClothes.map(c => [c.id, c]))
      const itens = LOOK_SLOTS
         .map(slot => ({ slot, cloth: byId[this._slots[slot.key]] }))
         .filter(item => item.cloth)

      if (itens.length === 0) {
         canvas.classList.add('look-canvas-vazia')
         canvas.innerHTML = `<p class="look-canvas-aviso">Toque em Adicionar peça para começar</p>`
         return
      }

      canvas.classList.remove('look-canvas-vazia')

      const { principal, extras, esquerda, direita } = arranjoDoLook(itens)

      const desenhar = (item) => `
         <button class="look-slot filled" data-slot="${item.slot.key}">
            <img src="${escapeHtml(item.cloth.image_url)}" alt="${escapeHtml(item.cloth.type || '')}">
         </button>
      `

      // Quantas calhas o quadro abre. Sem extra nenhum, nenhuma, e o centro toma o quadro
      // inteiro. Com uma peça só no centro, uma calha à direita. Com duas peças empilhadas,
      // as duas calhas, e a da esquerda continua reservada mesmo vazia pra o centro não sair
      // do meio quando o look tem um extra só. O porquê das larguras está no arranjoDoLook.
      const calhas = !extras.length || !principal.length ? 0 : (principal.length > 1 ? 2 : 1)
      canvas.classList.toggle('tem-calhas', calhas === 2)
      canvas.classList.toggle('tem-calha-direita', calhas === 1)

      if (!principal.length) {
         // Look só de acessório. Sem centro as calhas não fazem sentido, porque seriam duas
         // tirinhas nas bordas com o meio vazio, pior que a fileira antiga. Então os extras
         // viram um bloco no meio do quadro. O data-n existe porque com um acessório só a
         // grade de duas colunas jogaria ele na metade esquerda.
         canvas.innerHTML =
            `<div class="colagem-solta" data-n="${extras.length}">${extras.map(desenhar).join('')}</div>`
      } else {
         const calha = (lado, itensDaCalha) =>
            `<div class="colagem-calha colagem-${lado}">${itensDaCalha.map(desenhar).join('')}</div>`

         // uma peça só no centro ganha classe própria: a caixa dela encosta na foto em vez
         // de esticar até o pé do quadro e virar um retângulo claro com a peça boiando
         const centro = principal.length === 1
            ? 'colagem-principal colagem-principal-unica'
            : 'colagem-principal'

         canvas.innerHTML =
            (calhas === 2 ? calha('esquerda', esquerda) : '') +
            `<div class="${centro}">${principal.map(desenhar).join('')}</div>` +
            (calhas >= 1 ? calha('direita', direita) : '')
      }

      canvas.querySelectorAll('.look-slot').forEach(el => {
         this.ligarRemocao(el)
         el.addEventListener('click', () => {
            // o clique que vem logo depois de um toque longo é o da própria remoção
            if (this._ignorarProximoClique) return
            this.abrirEscolha({ slotKey: el.dataset.slot })
         })
      })
   },

   // abre a folha de baixo com as peças que cabem naquele espaço
   // Uma folha só, dois modos. Com slotKey, lista as peças que cabem naquele espaço e
   // guarda ali. Sem slotKey (o botão de adicionar), lista o armário inteiro e deixa a
   // zona da peça decidir onde ela entra. O que muda entre os dois é só o que listar e
   // onde guardar, então não vale ter duas funções.
   abrirEscolha({ slotKey = null } = {}) {
      const slot   = slotKey ? LOOK_SLOTS.find(s => s.key === slotKey) : null
      const pieces = slot ? this.piecesForSlot(slot) : this._buildClothes
      this._pickerSlot = slotKey

      document.getElementById('picker-title').textContent =
         slot ? `Escolher ${slot.hint}` : 'Adicionar peça'

      const grid      = document.getElementById('picker-grid')
      const currentId = slotKey ? this._slots[slotKey] : null

      if (pieces.length === 0) {
         grid.innerHTML = `<p class="picker-empty">${slot
            ? 'Nenhuma peça dessa categoria no armário ainda.'
            : 'Seu armário está vazio.'}</p>`
      } else {
         // tirar a peça do look sem escolher outra. Só faz sentido quando a folha foi
         // aberta a partir de um espaço que já tem peça.
         const clearBtn = currentId
            ? `<button class="picker-remove" data-clear="1">Tirar do look</button>`
            : ''

         grid.innerHTML = clearBtn + pieces.map(c => `
            <button class="picker-item ${c.id === currentId ? 'selected' : ''}" data-id="${escapeHtml(c.id)}">
               <img src="${escapeHtml(c.image_url)}" alt="" loading="lazy">
            </button>
         `).join('')
      }

      grid.querySelectorAll('.picker-item, .picker-remove').forEach(el => {
         el.addEventListener('click', () => {
            if (el.dataset.clear)          this._slots[this._pickerSlot] = null
            else if (this._pickerSlot)     this._slots[this._pickerSlot] = el.dataset.id
            else                           this.encaixar(el.dataset.id)

            this.closePicker()
            this.renderCanvas()
         })
      })

      const sheet = document.getElementById('picker-sheet')
      sheet.classList.remove('hidden')
      requestAnimationFrame(() => sheet.classList.add('open'))
   },

   closePicker() {
      const sheet = document.getElementById('picker-sheet')
      sheet.classList.remove('open')
      setTimeout(() => sheet.classList.add('hidden'), 250)
   },

   // abre o look salvo em tamanho grande, mostrando todas as peças
   openLookDetail(lookId) {
      // pode vir da lista de salvos ou de um dia planejado
      let look = this._savedLooks.find(l => l.id === lookId)
      if (!look) {
         const p = (this._planned || []).find(pl => pl.look && pl.look.id === lookId)
         look = p ? p.look : null
      }
      if (!look) return

      this._detailLookId = lookId
      this._detailLook   = look

      const clothes = look.clothes || []
      document.getElementById('detail-title').textContent = `Look ${look.mode}`
      document.getElementById('detail-body').innerHTML = `
         <div class="look-clothes">
            ${clothes.map(c => `
               <div class="look-item">
                  <img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.type || '')}">
                  <span>${escapeHtml(c.type || '')}</span>
               </div>
            `).join('')}
         </div>
      `

      // deixa o seletor de data já no dia de hoje, sem permitir agendar no passado
      const today     = this._todayStr()
      const dateInput = document.getElementById('plan-date')
      dateInput.min   = today
      dateInput.value = today

      const sheet = document.getElementById('look-detail')
      sheet.classList.remove('hidden')
      requestAnimationFrame(() => sheet.classList.add('open'))
   },

   closeLookDetail() {
      const sheet = document.getElementById('look-detail')
      sheet.classList.remove('open')
      setTimeout(() => sheet.classList.add('hidden'), 250)
   },

   loadImg(url) {
      return new Promise((resolve, reject) => {
         const img = new Image()
         // crossOrigin permite exportar o canvas depois (as imagens são de outro domínio)
         img.crossOrigin = 'anonymous'
         img.onload  = () => resolve(img)
         img.onerror = () => reject(new Error('falha ao carregar imagem'))
         img.src = url
      })
   },

   _downloadBlob(blob, name) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
   },

   // monta uma imagem do look (peças grandes no centro, extras nas calhas dos lados)
   // e abre o compartilhamento do celular. No computador, baixa a imagem.
   async shareLook() {
      const look    = this._detailLook
      const clothes = look ? (look.clothes || []) : []
      if (!clothes.length) return

      const btn       = document.getElementById('detail-share')
      btn.disabled    = true
      btn.textContent = 'Gerando imagem...'

      try {
         // Mesma decisão de layout da colagem, e agora sem nenhum ajuste: o maxAcessorios
         // que existia aqui cortava o terceiro acessório porque a fileira de baixo tinha
         // 1080px de largura e não cabia um quinto quadro. Com os extras nas calhas o
         // limite virou altura, e 1350px engole três empilhados sem aperto. Ou seja, o que
         // a pessoa monta é o que ela compartilha.
         const { principal, extras, esquerda, direita } = arranjoDoLook(clothes.map(c => ({ cloth: c })))
         const all = [...principal, ...extras].map(i => i.cloth)
         const corpoInteiro = principal.length === 1 && zoneOf(principal[0].cloth.type) === 'full'


         // carrega todas as imagens usadas
         const imgs = new Map()
         await Promise.all(all.map(async c => imgs.set(c.id, await this.loadImg(c.image_url))))

         const W = 1080, H = 1350
         const canvas  = document.createElement('canvas')
         canvas.width  = W
         canvas.height = H
         const ctx = canvas.getContext('2d')

         ctx.fillStyle = '#F5F8F1'
         ctx.fillRect(0, 0, W, H)

         ctx.fillStyle = '#252E20'
         ctx.textAlign = 'center'
         ctx.font      = "700 58px 'Segoe UI', Arial, sans-serif"
         ctx.fillText('EntreLooks', W / 2, 112)

         const draw = (c, x, y, w, h) => {
            const img = imgs.get(c.id)
            if (!img) return
            const r  = Math.min(w / img.width, h / img.height)
            const dw = img.width * r, dh = img.height * r
            ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
         }

         // As mesmas proporções da colagem, só que em pixel: calha de 22% da área útil de
         // cada lado e o centro no que sobra. A área começa embaixo do título.
         const MARGEM = 60, GAP = 26, TOPO = 180, BASE = 1290
         const util       = W - MARGEM * 2
         const alturaUtil = BASE - TOPO
         // mesma contagem de calhas da colagem, pelo mesmo motivo
         const calhas  = !extras.length || !principal.length ? 0 : (principal.length > 1 ? 2 : 1)
         const calhaW  = calhas ? Math.round(util * 0.22) : 0
         const centroW = util - (calhaW + GAP) * calhas
         const centroX = MARGEM + (calhas === 2 ? calhaW + GAP : 0)

         if (!principal.length) {
            // look só de acessório, mesmo caso da colagem: sem centro, vira um bloco de
            // duas colunas no meio do quadro
            const cols = Math.min(extras.length, 2)
            const rows = Math.ceil(extras.length / cols)
            const box  = Math.min((util - (cols - 1) * GAP) / cols,
                                  (alturaUtil - (rows - 1) * GAP) / rows)
            const blocoW = cols * box + (cols - 1) * GAP
            const blocoH = rows * box + (rows - 1) * GAP
            extras.forEach((item, i) => {
               const cx = MARGEM + (util - blocoW) / 2 + (i % cols) * (box + GAP)
               const cy = TOPO + (alturaUtil - blocoH) / 2 + Math.floor(i / cols) * (box + GAP)
               draw(item.cloth, cx, cy, box, box)
            })
         } else if (corpoInteiro) {
            draw(principal[0].cloth, centroX, TOPO, centroW, alturaUtil)
         } else {
            const h = (alturaUtil - GAP) / 2
            if (principal[0]) draw(principal[0].cloth, centroX, TOPO, centroW, h)
            if (principal[1]) draw(principal[1].cloth, centroX, TOPO + h + GAP, centroW, h)
         }

         // A esquerda empilha do topo pra baixo e a direita da base pra cima. É só isso que
         // produz o escalonamento em diagonal, o mesmo da colagem: com um extra de cada lado
         // eles não ficam parados na mesma altura.
         esquerda.forEach((item, i) => {
            draw(item.cloth, MARGEM, TOPO + i * (calhaW + GAP), calhaW, calhaW)
         })
         const direitaX = centroX + centroW + GAP
         direita.forEach((item, i) => {
            draw(item.cloth, direitaX, BASE - calhaW - i * (calhaW + GAP), calhaW, calhaW)
         })

         const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
         if (!blob) throw new Error('sem imagem')

         const file = new File([blob], 'look-entrelooks.png', { type: 'image/png' })

         if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
               await navigator.share({ files: [file], title: 'Meu look' })
            } catch (e) {
               // se não for cancelamento do usuário, cai pro download
               if (e.name !== 'AbortError') this._downloadBlob(blob, 'look-entrelooks.png')
            }
         } else {
            this._downloadBlob(blob, 'look-entrelooks.png')
         }
      } catch (e) {
         showToast('Não consegui gerar a imagem agora. Tente um print.', 'error')
      } finally {
         btn.disabled    = false
         btn.textContent = 'Compartilhar look'
      }
   },

   // ============ PLANEJAR ============

   _todayStr() {
      const d = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
   },

   _formatDate(dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number)
      const date  = new Date(y, m - 1, d)
      const dias  = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      return `${dias[date.getDay()]}, ${d} de ${meses[m - 1]}`
   },

   async planLook() {
      const date = document.getElementById('plan-date').value
      if (!date || !this._detailLookId) return

      const btn       = document.getElementById('plan-btn')
      btn.disabled    = true
      btn.textContent = 'Planejando...'

      const response = await API.post('/looks/plan', { look_id: this._detailLookId, date })

      btn.disabled    = false
      btn.textContent = 'Planejar pra esse dia'

      if (response?.ok) {
         showToast('Look planejado')
         this.closeLookDetail()
         await this.loadPlanned()
      } else {
         showToast('Erro ao planejar. Tente de novo.', 'error')
      }
   },

   async loadPlanned() {
      const response = await API.get('/looks/planned')
      if (!response?.ok) return
      this._planned = await response.json()
      this.renderPlanned()
   },

   renderPlanned() {
      const container = document.getElementById('planned-list')
      const planned   = this._planned || []

      if (planned.length === 0) {
         container.innerHTML = `
            <div class="empty-state" style="grid-column:unset">
               <p>Nenhum look planejado</p>
               <span>Abra um look salvo aqui embaixo e escolha um dia pra usar ele</span>
            </div>
         `
         return
      }

      const today    = this._todayStr()
      const upcoming = planned.filter(p => p.date >= today)
      const past     = planned.filter(p => p.date < today).reverse()

      const card = (p) => {
         const look    = p.look || {}
         const clothes = (look.clothes || []).slice(0, 4)
         return `
            <div class="planned-card" data-look="${escapeHtml(look.id || '')}">
               <button class="cloth-delete-btn planned-remove" data-plan="${escapeHtml(p.id)}" aria-label="Tirar do dia">×</button>
               <div class="planned-date">${this._formatDate(p.date)}</div>
               <div class="planned-thumbs">
                  ${clothes.map(c => `<img src="${escapeHtml(c.image_url)}" alt="" loading="lazy">`).join('')}
               </div>
            </div>
         `
      }

      container.innerHTML = `
         ${upcoming.length ? `<h2 class="section-title">Próximos</h2><div class="planned-grid">${upcoming.map(card).join('')}</div>` : ''}
         ${past.length ? `<h2 class="section-title" style="margin-top:var(--space-lg)">Já usados</h2><div class="planned-grid">${past.map(card).join('')}</div>` : ''}
      `

      container.querySelectorAll('.planned-remove').forEach(btn => {
         btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.removePlanned(btn.dataset.plan)
         })
      })

      container.querySelectorAll('.planned-card').forEach(cardEl => {
         cardEl.addEventListener('click', () => this.openLookDetail(cardEl.dataset.look))
      })
   },

   async removePlanned(planId) {
      const response = await API.delete(`/looks/planned/${planId}`)
      if (!response?.ok) {
         showToast('Erro ao remover', 'error')
         return
      }
      this._planned = this._planned.filter(p => p.id !== planId)
      this.renderPlanned()
      showToast('Removido do dia')
   },

   async saveManualLook() {
      // pega as peças da colagem na ordem dos espaços, sem repetir.
      // se tem vestido no centro, a parte de baixo é ignorada mesmo que tenha sobrado ali.
      const fullTop = this.topIsFull()
      const ids = [...new Set(
         LOOK_SLOTS
            .filter(s => !(s.key === 'bottom' && fullTop))
            .map(s => this._slots[s.key])
            .filter(Boolean)
      )]

      if (ids.length < 2) {
         showToast('Monte um look com pelo menos 2 peças', 'error')
         return
      }

      const btn = document.getElementById('build-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.post('/looks/manual', {
         clothes_ids: ids,
         mode:        this.buildMode
      })

      if (response?.ok) {
         await this.loadSavedLooks()
         showToast('Look salvo!')
      } else {
         const err = response ? await response.json().catch(() => ({})) : {}
         showToast(err.detail || 'Erro ao salvar o look', 'error')
      }

      btn.disabled    = false
      btn.textContent = 'Salvar look'
   },

   // ============ GERADOR POR IA ============

   async generate() {
      const btn    = document.getElementById('generate-btn')
      const result = document.getElementById('look-result')

      btn.disabled = true
      startMsgRotation('generate-btn')
      result.classList.add('hidden')

      // o clima vem da Home (que pede a localização uma vez) e fica guardado no app,
      // então aqui a gente só reaproveita pra IA não sugerir casaco em dia quente
      const payload = { mode: this.activeMode }
      const weather = getWeather()
      if (weather) payload.weather = weather

      const response = await API.post('/looks/generate', payload)

      btn.disabled = false
      stopMsgRotation('generate-btn', 'Gerar look')

      if (!response) return

      if (!response.ok) {
         const err        = await response.json()
         result.innerHTML = `<p class="look-error">${escapeHtml(err.detail || 'Erro ao gerar look')}</p>`
         result.classList.remove('hidden')
         return
      }

      this.currentLook = await response.json()
      this.renderLook(this.currentLook)
   },

   renderLook(look) {
      const result  = document.getElementById('look-result')
      const clothes = look.clothes || []

      result.innerHTML = `
         <div class="look-card">
            <div class="look-header">
               <span class="look-mode">${escapeHtml(look.mode)}</span>
            </div>
            <div class="look-clothes">
               ${clothes.map(c => `
                  <div class="look-item">
                     <img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.type || '')}">
                     <span>${escapeHtml(c.type || '')}</span>
                  </div>
               `).join('')}
            </div>
            <div class="look-actions">
               <button class="btn-reject" id="btn-reject">Não gostei</button>
               <button class="btn-primary" id="btn-save">Salvar look</button>
            </div>
         </div>
      `

      result.classList.remove('hidden')
      document.getElementById('btn-reject').addEventListener('click', () => this.rejectLook(look.id))
      document.getElementById('btn-save').addEventListener('click', () => this.saveLook(look.id))
   },

   async rejectLook(lookId) {
      const btn = document.getElementById('btn-reject')
      btn.disabled    = true
      btn.textContent = 'Ok...'

      await API.post(`/looks/${lookId}/reject`, {})
      await this.generate()
   },

   async saveLook(lookId) {
      const btn = document.getElementById('btn-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.patch(`/looks/${lookId}/save`)

      if (response?.ok) {
         btn.textContent = 'Salvo!'
         showToast('Look salvo')
         await this.loadSavedLooks()
      } else {
         btn.disabled    = false
         btn.textContent = 'Salvar look'
         showToast('Erro ao salvar', 'error')
      }
   },

   // ============ LOOKS SALVOS ============

   async loadSavedLooks(append = false) {
      if (this._loading && append) return
      this._loading = true

      if (!append) {
         this._offset     = 0
         this._savedLooks = []
      }

      try {
         const response = await API.get(`/looks/?limit=${this._limit}&offset=${this._offset}`)
         if (!response?.ok) return

         const page       = await response.json()
         this._hasMore    = page.length === this._limit
         this._savedLooks = append ? [...this._savedLooks, ...page] : page
         this._offset    += page.length

         this.renderSavedLooks()
      } finally {
         this._loading = false
      }
   },

   async loadMoreSaved() {
      await this.loadSavedLooks(true)
   },

   async deleteLook(lookId, btn) {
      if (btn.dataset.confirm !== 'true') {
         btn.dataset.confirm  = 'true'
         btn.textContent      = '?'
         btn.style.background = 'rgba(197,48,48,0.85)'
         setTimeout(() => {
            if (btn.dataset.confirm === 'true') {
               btn.dataset.confirm  = ''
               btn.textContent      = '×'
               btn.style.background = ''
            }
         }, 2500)
         return
      }

      btn.dataset.confirm = ''

      const response = await API.delete(`/looks/${lookId}`)
      if (!response?.ok) {
         showToast('Erro ao remover look', 'error')
         return
      }

      this._savedLooks = this._savedLooks.filter(l => l.id !== lookId)
      this.renderSavedLooks()
      showToast('Look removido')
   },

   renderSavedLooks() {
      const container = document.getElementById('saved-looks')
      const looks     = this._savedLooks

      if (!looks || looks.length === 0) {
         container.innerHTML = `
            <div class="empty-state" style="grid-column:unset;margin-top:var(--space-xl)">
               <p>Nenhum look salvo ainda</p>
               <span>Monte um look acima ou gere com a IA e salve os que mais gostar</span>
            </div>
         `
         return
      }

      const loadMoreBtn = this._hasMore
         ? `<button class="btn-secondary load-more-looks" id="load-more-looks">Carregar mais</button>`
         : ''

      container.innerHTML = `
         <h2 class="section-title">Looks salvos</h2>
         <div class="saved-grid">
            ${looks.map(look => {
               const pecas = look.clothes || []
               // Até seis, e não quatro. Com quatro, um look de cinco perdia uma peça em
               // silêncio: os acessórios eram os primeiros a sumir, justamente por virem
               // por último na ordem do look.
               const mostradas = pecas.slice(0, 6)

               // clothes_ids é o que o look tem; clothes é o que ainda existe no armário.
               // A diferença são peças apagadas depois que o look foi salvo, e o array não
               // tem chave estrangeira pra limpar isso sozinho. Antes o card só encolhia,
               // sem dizer nada.
               const sumidas = (look.clothes_ids || []).length - pecas.length

               return `
               <div class="saved-look-card" data-id="${escapeHtml(look.id)}">
                  <button class="cloth-delete-btn" data-id="${escapeHtml(look.id)}" aria-label="Remover look">×</button>
                  <div class="saved-look-clothes" data-muitas="${mostradas.length > 4}">
                     ${mostradas.map(c => `
                        <img src="${escapeHtml(urlMiniatura(c.image_url, 96, 96))}"
                             onerror="this.onerror=null;this.src='${escapeHtml(c.image_url)}'"
                             alt="${escapeHtml(c.type || '')}" loading="lazy">
                     `).join('')}
                  </div>
                  <span class="look-mode">${escapeHtml(look.mode)}</span>
                  ${sumidas > 0 ? `<span class="look-sumidas">${sumidas === 1
                     ? '1 peça saiu do armário'
                     : `${sumidas} peças saíram do armário`}</span>` : ''}
               </div>
            `}).join('')}
         </div>
         ${loadMoreBtn}
      `

      container.querySelectorAll('.cloth-delete-btn').forEach(btn => {
         btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.deleteLook(btn.dataset.id, btn)
         })
      })

      // tocar no card abre o look inteiro (o botão de excluir corta o clique antes)
      container.querySelectorAll('.saved-look-card').forEach(card => {
         card.addEventListener('click', () => this.openLookDetail(card.dataset.id))
      })

      if (this._hasMore) {
         document.getElementById('load-more-looks').addEventListener('click', () => this.loadMoreSaved())
      }
   }
}
