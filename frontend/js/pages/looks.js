const LooksPage = {
   currentLook: null,
   activeMode:  'casual',

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

      btn.disabled    = true
      btn.textContent = 'Gerando...'
      result.classList.add('hidden')

      try {
         const response = await fetch(`${CONFIG.API_URL}/looks/generate`, {
            method:  'POST',
            headers: Auth.getHeaders(),
            body:    JSON.stringify({ mode: this.activeMode })
         })

         if (!response.ok) {
            const err = await response.json()
            throw new Error(err.detail || 'Erro ao gerar look')
         }

         this.currentLook = await response.json()
         this.renderLook(this.currentLook)

      } catch (e) {
         result.innerHTML = `<p class="look-error">${e.message}</p>`
         result.classList.remove('hidden')
      } finally {
         btn.disabled    = false
         btn.textContent = 'Gerar look'
      }
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
               <button class="btn-secondary" id="btn-again">Gerar outro</button>
               <button class="btn-primary" id="btn-save">Salvar look</button>
            </div>
         </div>
      `

      result.classList.remove('hidden')

      document.getElementById('btn-again').addEventListener('click', () => this.generate())
      document.getElementById('btn-save').addEventListener('click', () => this.saveLook(look.id))
   },

   async saveLook(lookId) {
      const btn = document.getElementById('btn-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      try {
         const response = await fetch(`${CONFIG.API_URL}/looks/${lookId}/save`, {
            method:  'PATCH',
            headers: Auth.getHeaders()
         })

         if (!response.ok) throw new Error()

         btn.textContent = 'Salvo!'
         await this.loadSavedLooks()

      } catch (e) {
         btn.disabled    = false
         btn.textContent = 'Salvar look'
      }
   },

   async loadSavedLooks() {
      try {
         const response = await fetch(`${CONFIG.API_URL}/looks/`, {
            headers: Auth.getHeaders()
         })
         if (!response.ok) throw new Error()
         const looks = await response.json()
         this.renderSavedLooks(looks)
      } catch (e) {
         // silent fail
      }
   },

   renderSavedLooks(looks) {
      const container = document.getElementById('saved-looks')

      if (!looks || looks.length === 0) {
         container.innerHTML = ''
         return
      }

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
      `
   }
}