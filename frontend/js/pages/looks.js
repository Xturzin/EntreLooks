const LooksPage = {
   currentLook:  null,
   activeMode:   'casual',
   _savedLooks:  [],
   _offset:      0,
   _limit:       20,
   _hasMore:     false,
   _loading:     false,

   render() {
      return `
         <div class="page">
            <div class="page-header">
               <h1 class="page-title">Looks</h1>
               <p class="page-subtitle">Combinações criadas para você</p>
            </div>

            <div class="mode-bar">
               <button class="mode-pill active" data-mode="casual">Casual</button>
               <button class="mode-pill" data-mode="elegante">Elegante</button>
               <button class="mode-pill" data-mode="trabalho">Trabalho</button>
               <button class="mode-pill" data-mode="festa">Festa</button>
            </div>

            <button class="btn-primary" id="generate-btn">Gerar look</button>

            <div id="look-result" class="look-result hidden"></div>
            <div id="saved-looks" class="saved-looks"></div>
         </div>
      `
   },

   async init() {
      this.currentLook = null
      this.activeMode  = 'casual'
      this._savedLooks = []
      this._offset     = 0
      this._hasMore    = false

      document.querySelectorAll('.mode-pill').forEach(pill => {
         pill.addEventListener('click', () => {
            this.activeMode = pill.dataset.mode
            document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'))
            pill.classList.add('active')
         })
      })

      document.getElementById('generate-btn').addEventListener('click', () => this.generate())
      await this.loadSavedLooks()
   },

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

         this.renderSavedLooks()
      } finally {
         this._loading = false
      }
   },

   async loadMoreSaved() {
      this._offset += this._limit
      await this.loadSavedLooks(true)
   },

   renderSavedLooks() {
      const container = document.getElementById('saved-looks')
      const looks     = this._savedLooks

      if (!looks || looks.length === 0) {
         container.innerHTML = `
            <div class="empty-state" style="grid-column:unset;margin-top:var(--space-xl)">
               <p>Nenhum look salvo ainda</p>
               <span>Gere um look acima e salve os que você mais gostar</span>
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

      if (this._hasMore) {
         document.getElementById('load-more-looks').addEventListener('click', () => this.loadMoreSaved())
      }
   }
}