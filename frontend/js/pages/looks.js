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
   top:       ['vestido', 'macacão', 'macacao', 'macaquinho', 'jardineira', 'camiseta', 'camisa', 'blusa', 'top', 'cropped', 'regata', 'moletom', 'casaco', 'jaqueta', 'blazer', 'suéter', 'sueter', 'tricô', 'tricot', 'cardigã', 'cardiga', 'colete', 'body', 'bata'],
}

// Ordem de teste importa: calçado e acessório antes de top pra não cair no genérico.
function zoneOf(type) {
   const t = (type || '').toLowerCase()
   for (const zone of ['shoes', 'bag', 'accessory', 'bottom', 'top']) {
      if (ZONE_KEYWORDS[zone].some(word => t.includes(word))) return zone
   }
   // sem correspondência, trata como parte de cima
   return 'top'
}

const LooksPage = {
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
               <button class="look-tab active" data-tab="build">Montar eu mesmo</button>
               <button class="look-tab" data-tab="ai">Gerar com IA</button>
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

      // troca de abas (Montar / IA)
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

      // já abre com um look montado, pra pessoa ver a colagem pronta
      this.shuffleLook()
   },

   // peças do armário que cabem numa zona (parte de cima, calçado, etc.)
   piecesInZone(zone) {
      return this._buildClothes.filter(c => zoneOf(c.type) === zone)
   },

   // sorteia uma peça pra cada espaço, sem repetir a mesma peça em dois lugares
   shuffleLook() {
      const used = new Set()

      LOOK_SLOTS.forEach(slot => {
         const options = this.piecesInZone(slot.zone).filter(c => !used.has(c.id))
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

      const byId = Object.fromEntries(this._buildClothes.map(c => [c.id, c]))

      canvas.innerHTML = LOOK_SLOTS.map(slot => {
         const cloth = this._slots[slot.key] ? byId[this._slots[slot.key]] : null

         if (cloth) {
            return `
               <button class="look-slot filled area-${slot.area}" data-slot="${slot.key}">
                  <img src="${cloth.image_url}" alt="">
               </button>
            `
         }

         return `
            <button class="look-slot empty area-${slot.area}" data-slot="${slot.key}">
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
      const pieces = this.piecesInZone(slot.zone)
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
            <button class="picker-item ${c.id === currentId ? 'selected' : ''}" data-id="${c.id}">
               <img src="${c.image_url}" alt="">
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

   async saveManualLook() {
      // pega as peças da colagem na ordem dos espaços, sem repetir
      const ids = [...new Set(LOOK_SLOTS.map(s => this._slots[s.key]).filter(Boolean))]

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
         Analytics.saveLook(this.buildMode)
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

      Analytics.generateLook(this.activeMode, false)

      const response = await API.post('/looks/generate', { mode: this.activeMode })

      btn.disabled = false
      stopMsgRotation('generate-btn', 'Gerar look')

      if (!response) return

      if (!response.ok) {
         const err        = await response.json()
         result.innerHTML = `<p class="look-error">${err.detail || 'Erro ao gerar look'}</p>`
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
               <span class="look-mode">${look.mode}</span>
            </div>
            <div class="look-clothes">
               ${clothes.map(c => `
                  <div class="look-item">
                     <img src="${c.image_url}" alt="${c.type || ''}">
                     <span>${c.type || ''}</span>
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

      Analytics.rejectLook(this.activeMode)
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
         Analytics.saveLook(this.currentLook?.mode || this.activeMode)
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
               <div class="saved-look-card">
                  <button class="cloth-delete-btn" data-id="${look.id}" aria-label="Remover look">×</button>
                  <div class="saved-look-clothes">
                     ${(look.clothes || []).slice(0, 4).map(c => `
                        <img src="${c.image_url}" alt="${c.type || ''}">
                     `).join('')}
                  </div>
                  <span class="look-mode">${look.mode}</span>
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

      if (this._hasMore) {
         document.getElementById('load-more-looks').addEventListener('click', () => this.loadMoreSaved())
      }
   }
}
