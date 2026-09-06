// Posições fixas da colagem do look. A ordem aqui é a ordem que as peças
// entram no look salvo. O "area" casa com o grid-template-areas do CSS,
// e o "zone" diz que tipo de peça cabe em cada espaço.
const LOOK_SLOTS = [
   { key: 'top',    zone: 'top',       area: 'top',    hint: 'parte de cima' },
   { key: 'bottom', zone: 'bottom',    area: 'bottom', hint: 'parte de baixo' },
   { key: 'shoes',  zone: 'shoes',     area: 'shoes',  hint: 'calçado' },
   { key: 'bag',    zone: 'bag',       area: 'bag',    hint: 'bolsa' },
   { key: 'acc1',   zone: 'accessory', area: 'acc1',   hint: 'acessório' },
   { key: 'acc2',   zone: 'accessory', area: 'acc2',   hint: 'acessório' },
   { key: 'acc3',   zone: 'accessory', area: 'acc3',   hint: 'acessório' },
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
   shuffleLook() {
      const used = new Set()

      LOOK_SLOTS.forEach(slot => {
         // com vestido/macacão na parte de cima, a parte de baixo fica de fora
         if (slot.key === 'bottom' && this.topIsFull()) {
            this._slots.bottom = null
            return
         }

         const options = this.piecesForSlot(slot).filter(c => !used.has(c.id))
         if (options.length === 0) {
            this._slots[slot.key] = null
            return
         }
         const pick = options[Math.floor(Math.random() * options.length)]
         this._slots[slot.key] = pick.id
         used.add(pick.id)
      })

      this.renderCanvas()
   },

   renderCanvas() {
      const canvas = document.getElementById('look-canvas')
      canvas.classList.remove('look-canvas-empty')

      const byId    = Object.fromEntries(this._buildClothes.map(c => [c.id, c]))
      const fullTop = this.topIsFull()

      canvas.innerHTML = LOOK_SLOTS.map(slot => {
         // com vestido no centro, o espaço da parte de baixo nem é desenhado
         if (slot.key === 'bottom' && fullTop) return ''

         const cloth   = this._slots[slot.key] ? byId[this._slots[slot.key]] : null
         // a peça de corpo inteiro estica o espaço de cima pra ocupar o centro todo
         const fullMod = (slot.key === 'top' && fullTop) ? ' is-full' : ''

         if (cloth) {
            return `
               <button class="look-slot filled area-${slot.area}${fullMod}" data-slot="${slot.key}">
                  <img src="${escapeHtml(cloth.image_url)}" alt="">
               </button>
            `
         }

         return `
            <button class="look-slot empty area-${slot.area}${fullMod}" data-slot="${slot.key}">
               <span class="look-slot-hint">${slot.hint}</span>
            </button>
         `
      }).join('')

      canvas.querySelectorAll('.look-slot').forEach(el => {
         el.addEventListener('click', () => this.openPicker(el.dataset.slot))
      })
   },

   // abre a folha de baixo com as peças que cabem naquele espaço
   openPicker(slotKey) {
      const slot   = LOOK_SLOTS.find(s => s.key === slotKey)
      const pieces = this.piecesForSlot(slot)
      this._pickerSlot = slotKey

      document.getElementById('picker-title').textContent = `Escolher ${slot.hint}`

      const grid      = document.getElementById('picker-grid')
      const currentId = this._slots[slotKey]

      if (pieces.length === 0) {
         grid.innerHTML = `<p class="picker-empty">Nenhuma peça dessa categoria no armário ainda.</p>`
      } else {
         // se o espaço já tem peça, deixa tirar sem escolher outra
         const clearBtn = currentId
            ? `<button class="picker-item picker-clear" data-clear="1">tirar</button>`
            : ''

         grid.innerHTML = clearBtn + pieces.map(c => `
            <button class="picker-item ${c.id === currentId ? 'selected' : ''}" data-id="${escapeHtml(c.id)}">
               <img src="${escapeHtml(c.image_url)}" alt="">
            </button>
         `).join('')
      }

      grid.querySelectorAll('.picker-item').forEach(el => {
         el.addEventListener('click', () => {
            this._slots[this._pickerSlot] = el.dataset.clear ? null : el.dataset.id
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

   // monta uma imagem do look (peça de cima e de baixo no centro, extras embaixo)
   // e abre o compartilhamento do celular. No computador, baixa a imagem.
   async shareLook() {
      const look    = this._detailLook
      const clothes = look ? (look.clothes || []) : []
      if (!clothes.length) return

      const btn       = document.getElementById('detail-share')
      btn.disabled    = true
      btn.textContent = 'Gerando imagem...'

      try {
         // separa as peças por posição
         const byZone = { top: [], bottom: [], full: [], shoes: [], bag: [], accessory: [] }
         clothes.forEach(c => (byZone[zoneOf(c.type)] || byZone.accessory).push(c))

         const extras = [
            ...byZone.shoes.slice(0, 1),
            ...byZone.bag.slice(0, 1),
            ...byZone.accessory.slice(0, 2)
         ]
         const all = [
            ...byZone.full.slice(0, 1),
            ...byZone.top.slice(0, 1),
            ...byZone.bottom.slice(0, 1),
            ...extras
         ]

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

         if (byZone.full[0]) {
            draw(byZone.full[0], 290, 180, 500, 740)
         } else {
            if (byZone.top[0])    draw(byZone.top[0], 315, 180, 450, 410)
            if (byZone.bottom[0]) draw(byZone.bottom[0], 345, 560, 390, 460)
         }

         if (extras.length) {
            const boxW = 200, gap = 28
            const totalW = extras.length * boxW + (extras.length - 1) * gap
            let ex = (W - totalW) / 2
            extras.forEach(c => { draw(c, ex, 1070, boxW, boxW); ex += boxW + gap })
         }

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
                  ${clothes.map(c => `<img src="${escapeHtml(c.image_url)}" alt="">`).join('')}
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
            ${looks.map(look => `
               <div class="saved-look-card" data-id="${escapeHtml(look.id)}">
                  <button class="cloth-delete-btn" data-id="${escapeHtml(look.id)}" aria-label="Remover look">×</button>
                  <div class="saved-look-clothes">
                     ${(look.clothes || []).slice(0, 4).map(c => `
                        <img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.type || '')}">
                     `).join('')}
                  </div>
                  <span class="look-mode">${escapeHtml(look.mode)}</span>
               </div>
            `).join('')}
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
