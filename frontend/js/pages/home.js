const WEATHER_CODES = {
   0:  { label: 'Sol aberto',         icon: '☀️' },
   1:  { label: 'Quase limpo',         icon: '🌤️' },
   2:  { label: 'Parcialmente nublado',icon: '⛅' },
   3:  { label: 'Nublado',            icon: '☁️' },
   45: { label: 'Neblina',            icon: '🌫️' },
   48: { label: 'Neblina',            icon: '🌫️' },
   51: { label: 'Garoa leve',         icon: '🌦️' },
   61: { label: 'Chuva leve',         icon: '🌧️' },
   63: { label: 'Chuva moderada',     icon: '🌧️' },
   65: { label: 'Chuva forte',        icon: '🌧️' },
   80: { label: 'Chuva rápida',       icon: '🌦️' },
   81: { label: 'Chuva moderada',     icon: '🌧️' },
   82: { label: 'Chuva intensa',      icon: '⛈️' },
   95: { label: 'Tempestade',         icon: '⛈️' },
}

function getWeatherInfo(code) {
   if (WEATHER_CODES[code]) return WEATHER_CODES[code]
   if (code >= 71 && code <= 77) return { label: 'Neve', icon: '❄️' }
   if (code >= 85 && code <= 86) return { label: 'Neve forte', icon: '❄️' }
   return { label: 'Tempo variado', icon: '🌡️' }
}

const HomePage = {
   currentLook: null,
   autoMode:    'casual',
   weather:     null,

   render() {
      return `
         <div class="page home-page">
            <div class="home-greeting">
               <p class="home-greeting-label" id="greeting-label"></p>
               <h1 class="home-greeting-title">O que vamos vestir?</h1>
            </div>

            <div id="weather-widget" class="weather-loading"></div>

            <button class="quick-btn" id="quick-btn">
               <span id="quick-btn-text">Me ajuda a me vestir</span>
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
      this.weather     = null
      this.setupGreeting()
      this.loadStats()
      this.loadWeather()

      document.getElementById('quick-btn').addEventListener('click', () => this.quickGenerate())
      document.getElementById('stat-wardrobe').addEventListener('click', () => navigate('wardrobe'))
      document.getElementById('stat-looks-card').addEventListener('click', () => navigate('looks'))
   },

   async loadWeather() {
      const widget = document.getElementById('weather-widget')

      if (!navigator.geolocation) return

      navigator.geolocation.getCurrentPosition(
         async (pos) => {
            try {
               const { latitude: lat, longitude: lon } = pos.coords

               const res  = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`
               )
               const data = await res.json()
               const temp = Math.round(data.current.temperature_2m)
               const code = data.current.weathercode
               const info = getWeatherInfo(code)

               this.weather = { temperature: temp, description: info.label }

               widget.className = 'weather-widget'
               widget.innerHTML = `
                  <span>${info.icon}</span>
                  <span class="weather-temp">${temp}°C</span>
                  <span>${info.label}</span>
               `
            } catch (e) {
               widget.innerHTML = ''
            }
         },
         () => {
            // usuário negou localização, ignora silenciosamente
            widget.innerHTML = ''
         }
      )
   },

   setupGreeting() {
      const hour = new Date().getHours()
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
      document.getElementById('greeting-label').textContent   = greeting
      document.getElementById('quick-mode-label').textContent = `look ${mode}`
   },

   async loadStats() {
      const [clothesRes, looksRes] = await Promise.all([
         API.get('/clothes/'),
         API.get('/looks/')
      ])

      if (clothesRes?.ok) {
         const clothes = await clothesRes.json()
         document.getElementById('stat-clothes').textContent = clothes.length
      }

      if (looksRes?.ok) {
         const looks = await looksRes.json()
         document.getElementById('stat-looks').textContent = looks.length
      }
   },

   async quickGenerate() {
      const btn = document.getElementById('quick-btn')

      btn.disabled = true
      startMsgRotation('quick-btn-text')

      const payload = { mode: this.autoMode }
      if (this.weather) payload.weather = this.weather

      Analytics.generateLook(this.autoMode, !!this.weather)

      const response = await API.post('/looks/generate', payload)

      if (!response) return

      if (!response.ok) {
         const err       = await response.json()
         const container = document.getElementById('home-look')
         container.innerHTML = `
            <p style="font-size: var(--text-sm); color: #C53030; text-align: center; padding: var(--space-md);">
               ${err.detail || 'Erro ao gerar look'}
            </p>
         `
         container.classList.remove('hidden')
      } else {
         this.currentLook = await response.json()
         this.renderLook(this.currentLook)
      }

      btn.disabled = false
      stopMsgRotation('quick-btn-text', 'Me ajuda a me vestir')
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
               <button class="btn-reject" id="home-btn-reject">Não gostei</button>
               <button class="btn-primary" id="home-btn-save">Salvar</button>
            </div>
         </div>
      `

      container.classList.remove('hidden')
      document.getElementById('home-btn-reject').addEventListener('click', () => this.rejectLook(look.id))
      document.getElementById('home-btn-save').addEventListener('click', () => this.saveLook(look.id))
   },

   async rejectLook(lookId) {
      const btn = document.getElementById('home-btn-reject')
      btn.disabled    = true
      btn.textContent = 'Ok...'

      Analytics.rejectLook(this.autoMode)
      await API.post(`/looks/${lookId}/reject`, {})
      await this.quickGenerate()
   },

   async saveLook(lookId) {
      const btn = document.getElementById('home-btn-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.patch(`/looks/${lookId}/save`)

      if (response?.ok) {
         btn.textContent = 'Salvo!'
         showToast('Look salvo com sucesso')
         Analytics.saveLook(this.autoMode)
      } else {
         btn.disabled    = false
         btn.textContent = 'Salvar'
         showToast('Erro ao salvar o look', 'error')
      }
   }
}