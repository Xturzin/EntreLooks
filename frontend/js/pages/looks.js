const LooksPage = {
   currentLook:  null,
   activeMode:   'casual',
   _savedLooks:  [],
   _offset:      0,
   _limit:       20,
   _hasMore:     false,
   _loading:     false,

   // --- construtor manual ---
   activeTab:    'build',        // 'build' | 'ai'
   buildMode:    'casual',
   buildFilter:  'all',
   _buildClothes: [],
   _selectedIds:  new Set(),

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
               <div class="filter-bar hidden" id="build-filter"></div>
               <div class="clothes-grid" id="build-grid"></div>
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

         <div class="build-tray hidden" id="build-tray">
            <div class="build-tray-items" id="build-tray-items"></div>
            <button class="btn-primary build-tray-save" id="build-save">Salvar look</button>
         </div>
      `
   },

   async init() {
      this.currentLook   = null
      this.activeMode    = 'casual'
      this.activeTab     = 'build'
      this.buildMode     = 'casual'
      this.buildFilter   = 'all'
      this._savedLooks   = []
      this._offset       = 0
      this._hasMore      = false
      this._buildClothes = []
      this._selectedIds  = new Set()

      // troca de abas (Montar / IA)
      document.querySelectorAll('.look-tab').forEach(tab => {
         tab.addEventListener('click', () => this.switchTab(tab.dataset.tab))
      })

      // modo do look manual
      this.bindModeBar('#build-mode-bar', 'buildMode')

      // modo do look da IA
      document.querySelectorAll('#ai-view .mode-pill').forEach(pill => {
         pill.addEventListener('click', () => {
            this.activeMode = pill.dataset.mode
            document.querySelectorAll('#ai-view .mode-pill').forEach(p => p.classList.remove('active'))
            pill.classList.add('active')
         })
      })

      document.getElementById('generate-btn').addEventListener('click', () => this.generate())
      document.getElementById('build-save').addEventListener('click', () => this.saveManualLook())

      await Promise.all([this.loadBuildClothes(), this.loadSavedLooks()])
   },

   bindModeBar(barSelector, stateKey) {
      document.querySelectorAll(`${barSelector} .mode-pill`).forEach(pill => {
         pill.addEventListener('click', () => {
            this[stateKey] = pill.dataset.bmode
            document.querySelectorAll(`${barSelector} .mode-pill`).forEach(p => p.classList.remove('active'))
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
      // a bandeja só faz sentido no modo Montar
      this.updateTray()
   },

   // ============ CONSTRUTOR MANUAL ============

   async loadBuildClothes() {
      const grid = document.getElementById('build-grid')
      grid.innerHTML = Array(6).fill(0).map(() => `
         <div class="skeleton-card">
            <div class="skeleton" style="width:100%;aspect-ratio:3/4"></div>
         </div>
      `).join('')

      const response = await API.get('/clothes/?limit=100&offset=0')
      if (!response) return

      this._buildClothes = response.ok ? await response.json() : []
      this.renderBuildFilters()
      this.renderBuildGrid()
   },

   renderBuildFilters() {
      const bar = document.getElementById('build-filter')

      if (this._buildClothes.length === 0) {
         bar.classList.add('hidden')
         return
      }

      const types = ['all', ...new Set(this._buildClothes.map(c => c.type).filter(Boolean))]

      bar.innerHTML = types.map(type => `
         <button class="filter-pill ${type === this.buildFilter ? 'active' : ''}" data-bfilter="${type}">
            ${type === 'all' ? 'Todas' : type}
         </button>
      `).join('')

      bar.classList.remove('hidden')

      bar.querySelectorAll('.filter-pill').forEach(pill => {
         pill.addEventListener('click', () => {
            this.buildFilter = pill.dataset.bfilter
            bar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'))
            pill.classList.add('active')
            this.renderBuildGrid()
         })
      })
   },

   renderBuildGrid() {
      const grid = document.getElementById('build-grid')

      if (this._buildClothes.length === 0) {
         grid.innerHTML = `
            <div class="empty-state">
               <p>Seu armário está vazio</p>
               <span>Adicione peças no Armário para montar seus looks</span>
            </div>
         `
         return
      }

      const list = this.buildFilter === 'all'
         ? this._buildClothes
         : this._buildClothes.filter(c => c.type === this.buildFilter)

      grid.innerHTML = list.map(cloth => {
         const selected = this._selectedIds.has(cloth.id)
         return `
            <div class="cloth-card build-card ${selected ? 'selected' : ''}" data-id="${cloth.id}">
               <img src="${cloth.image_url}" alt="${cloth.type || 'Roupa'}" loading="lazy">
               <div class="build-check">✓</div>
               <div class="cloth-info">
                  <span class="cloth-type">${cloth.type || 'Peça'}</span>
                  ${cloth.color ? `<span class="cloth-color">${cloth.color}</span>` : ''}
               </div>
            </div>
         `
      }).join('')

      grid.querySelectorAll('.build-card').forEach(card => {
         card.addEventListener('click', () => this.toggleSelect(card.dataset.id))
      })
   },

   toggleSelect(clothId) {
      if (this._selectedIds.has(clothId)) {
         this._selectedIds.delete(clothId)
      } else {
         this._selectedIds.add(clothId)
      }

      const card = document.querySelector(`.build-card[data-id="${clothId}"]`)
      if (card) card.classList.toggle('selected', this._selectedIds.has(clothId))

      this.updateTray()
   },

   updateTray() {
      const tray = document.getElementById('build-tray')
      if (!tray) return

      const show = this.activeTab === 'build' && this._selectedIds.size > 0
      tray.classList.toggle('hidden', !show)
      document.getElementById('build-view').classList.toggle('tray-open', show)

      if (!show) return

      const selected = this._buildClothes.filter(c => this._selectedIds.has(c.id))
      const itemsEl  = document.getElementById('build-tray-items')

      itemsEl.innerHTML = selected.map(c => `
         <div class="build-tray-item" data-id="${c.id}">
            <img src="${c.image_url}" alt="${c.type || ''}">
            <button class="build-tray-remove" data-id="${c.id}" aria-label="Tirar peça">×</button>
         </div>
      `).join('')

      itemsEl.querySelectorAll('.build-tray-remove').forEach(btn => {
         btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.toggleSelect(btn.dataset.id)
         })
      })

      const saveBtn = document.getElementById('build-save')
      saveBtn.textContent = `Salvar look (${this._selectedIds.size})`
   },

   async saveManualLook() {
      if (this._selectedIds.size < 2) {
         showToast('Escolha pelo menos 2 peças', 'error')
         return
      }

      const btn = document.getElementById('build-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.post('/looks/manual', {
         clothes_ids: [...this._selectedIds],
         mode:        this.buildMode
      })

      if (response?.ok) {
         Analytics.saveLook(this.buildMode)
         this._selectedIds.clear()
         this.renderBuildGrid()
         this.updateTray()
         await this.loadSavedLooks()
         showToast('Look montado e salvo!')
      } else {
         const err = response ? await response.json().catch(() => ({})) : {}
         showToast(err.detail || 'Erro ao salvar o look', 'error')
      }

      btn.disabled = false
      this.updateTray()
      if (this._selectedIds.size === 0) btn.textContent = 'Salvar look'
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
