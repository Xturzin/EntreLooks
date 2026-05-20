const HomePage = {
   currentLook: null,

   render() {
      return `
         <div class="page home-page">
            <div class="home-greeting">
               <p class="home-greeting-label" id="greeting-label"></p>
               <h1 class="home-greeting-title">O que vamos vestir?</h1>
            </div>

            <button class="quick-btn" id="quick-btn">
               <span>Me ajuda a me vestir</span>
               <span class="quick-btn-label" id="quick-mode-label"></span>
            </button>

            <div id="home-look" class="home-look hidden"></div>

            <div class="home-stats">
               <div class="home-stat-card" id="stat-wardrobe">
                  <div class="home-stat-number" id="stat-clothes">-</div>
                  <div class="home-stat-label">peças no armário</div>
               </div>
               <div class="home-stat-card" id="stat-looks-card">
                  <div class="home-stat-number" id="stat-looks">-</div>
                  <div class="home-stat-label">looks salvos</div>
               </div>
            </div>
         </div>
      `
   },

   init() {
      this.currentLook = null
      this.setupGreeting()
      this.loadStats()

      document.getElementById('quick-btn').addEventListener('click', () => this.quickGenerate())

      // atalhos para outras abas
      document.getElementById('stat-wardrobe').addEventListener('click', () => navigate('wardrobe'))
      document.getElementById('stat-looks-card').addEventListener('click', () => navigate('looks'))
   },

   setupGreeting() {
      const hour  = new Date().getHours()
      let greeting, mode

      if (hour >= 5 && hour < 12) {
         greeting = "Bom dia"
         mode     = "trabalho"
      } else if (hour >= 12 && hour < 18) {
         greeting = "Boa tarde"
         mode     = "casual"
      } else {
         greeting = "Boa noite"
         mode     = "elegante"
      }

      this.autoMode = mode
      document.getElementById('greeting-label').textContent    = greeting
      document.getElementById('quick-mode-label').textContent  = `look ${mode}`
   },

   async loadStats() {
      try {
         const [clothesRes, looksRes] = await Promise.all([
            fetch(`${CONFIG.API_URL}/clothes/`, { headers: Auth.getHeaders() }),
            fetch(`${CONFIG.API_URL}/looks/`, { headers: Auth.getHeaders() })
         ])

         if (clothesRes.ok) {
            const clothes = await clothesRes.json()
            document.getElementById('stat-clothes').textContent = clothes.length
         }

         if (looksRes.ok) {
            const looks = await looksRes.json()
            document.getElementById('stat-looks').textContent = looks.length
         }
      } catch (e) {
         // silent fail, stats ficam com "-"
      }
   },

   async quickGenerate() {
      const btn = document.getElementById('quick-btn')

      btn.disabled     = true
      btn.querySelector('span').textContent = 'Gerando...'

      try {
         const response = await fetch(`${CONFIG.API_URL}/looks/generate`, {
            method:  'POST',
            headers: Auth.getHeaders(),
            body:    JSON.stringify({ mode: this.autoMode })
         })

         if (!response.ok) {
            const err = await response.json()
            throw new Error(err.detail || 'Erro ao gerar look')
         }

         this.currentLook = await response.json()
         this.renderLook(this.currentLook)

      } catch (e) {
         const container = document.getElementById('home-look')
         container.innerHTML = `
            <p style="font-size: var(--text-sm); color: #C53030; text-align: center; padding: var(--space-md);">
               ${e.message}
            </p>
         `
         container.classList.remove('hidden')
      } finally {
         btn.disabled = false
         btn.querySelector('span').textContent = 'Me ajuda a me vestir'
      }
   },

   renderLook(look) {
      const container = document.getElementById('home-look')
      const clothes   = look.clothes || []

      container.innerHTML = `
         <p class="home-look-title">Look sugerido - ${look.mode}</p>
         <div class="home-look-card">
            <div class="home-look-clothes">
               ${clothes.map(c => `
                  <div class="home-look-item">
                     <img src="${c.image_url}" alt="${c.type || ''}">
                  </div>
               `).join('')}
            </div>
            <div class="home-look-actions">
               <button class="btn-secondary" id="home-btn-again">Gerar outro</button>
               <button class="btn-primary" id="home-btn-save">Salvar</button>
            </div>
         </div>
      `

      container.classList.remove('hidden')

      document.getElementById('home-btn-again').addEventListener('click', () => this.quickGenerate())
      document.getElementById('home-btn-save').addEventListener('click', () => this.saveLook(look.id))
   },

   async saveLook(lookId) {
      const btn = document.getElementById('home-btn-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      try {
         const response = await fetch(`${CONFIG.API_URL}/looks/${lookId}/save`, {
            method:  'PATCH',
            headers: Auth.getHeaders()
         })

         if (!response.ok) throw new Error()
         btn.textContent = 'Salvo!'

      } catch (e) {
         btn.disabled    = false
         btn.textContent = 'Salvar'
      }
   }
}