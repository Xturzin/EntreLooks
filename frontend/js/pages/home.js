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

   // Quantas vezes seguidas a pessoa pode apertar "Não gostei" e ganhar um look novo
   // automaticamente. Cada recusa gasta uma das 15 gerações por hora, e antes disso nada
   // segurava: dava pra torrar a cota inteira em quinze cliques e só descobrir no 429.
   LIMITE_RECUSAS_SEGUIDAS: 3,

   init() {
      this.currentLook     = null
      this.weather         = null
      this.recusasSeguidas = 0
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
               setWeather(this.weather)   // deixa disponível pra Mira no chat

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

      // se a pessoa disse o nome pra Mira, a saudação fica pessoal ("Boa tarde, Ana")
      const name = greetingName()
      document.getElementById('greeting-label').textContent   = name ? `${greeting}, ${name}` : greeting
      document.getElementById('quick-mode-label').textContent = `look ${mode}`
   },

   async loadStats() {
      const [statsRes, countRes] = await Promise.all([
         API.get('/clothes/stats'),
         API.get('/looks/count')
      ])

      if (statsRes?.ok) {
         const stats = await statsRes.json()
         document.getElementById('stat-clothes').textContent = stats.total
      }

      if (countRes?.ok) {
         const data = await countRes.json()
         document.getElementById('stat-looks').textContent =
            data.count > 99 ? '99+' : data.count
      }
   },

   async quickGenerate({ recomecar = true } = {}) {
      // pedir um look pelo botão principal é um começo de conversa, então zera a contagem.
      // Só a cadeia de recusas passa recomecar: false pra manter o contador subindo.
      if (recomecar) this.recusasSeguidas = 0

      const btn = document.getElementById('quick-btn')

      btn.disabled = true
      startMsgRotation('quick-btn-text')

      try {
         const payload = { mode: this.autoMode }
         if (this.weather) payload.weather = this.weather

         const response = await API.post('/looks/generate', payload)

         if (!response) return

         if (!response.ok) {
            const err = await response.json().catch(() => ({}))

            // 429 é cota nossa estourada (15 looks por hora). A mensagem genérica do backend
            // não diz que o limite é por hora nem que os pedidos anteriores contaram, então
            // aqui ela vira algo que explica o que aconteceu e o que fazer.
            const recado = response.status === 429
               ? 'Você já pediu vários looks nesta hora e o limite acabou. Daqui a pouco libera de novo.'
               : (err.detail || 'Erro ao gerar look')

            const container = document.getElementById('home-look')
            if (container) {
               container.innerHTML = `
                  <p style="font-size: var(--text-sm); color: #C53030; text-align: center; padding: var(--space-md);">
                     ${escapeHtml(recado)}
                  </p>
               `
               container.classList.remove('hidden')
            }
         } else {
            this.currentLook = await response.json()
            this.renderLook(this.currentLook)
         }
      } finally {
         btn.disabled = false
         stopMsgRotation('quick-btn-text', 'Me ajuda a me vestir')
      }
   },

   renderLook(look) {
      const container = document.getElementById('home-look')
      if (!container) return
      const clothes   = look.clothes || []

      container.innerHTML = `
         <p class="home-look-title">Look sugerido - ${escapeHtml(look.mode)}</p>
         <div class="home-look-card">
            <div class="home-look-clothes">
               ${clothes.map(c => `
                  <div class="home-look-item">
                     <img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.type || '')}">
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

      // a recusa é registrada sempre: ela alimenta o contexto negativo da IA mesmo quando
      // a gente para de gerar look novo em seguida
      await API.post(`/looks/${lookId}/reject`, {})

      this.recusasSeguidas++

      if (this.recusasSeguidas >= this.LIMITE_RECUSAS_SEGUIDAS) {
         // para a cadeia aqui. Continuar geraria uma chamada por clique até estourar a cota
         // e cair num 429 seco, sem a pessoa entender que gastou as gerações da hora.
         this.mostrarAvisoNoLook(
            'Anotei que esses não serviram. Tente de novo daqui a pouco, ou peça um look ' +
            'pelo botão acima escolhendo outro clima ou ocasião.'
         )
         return
      }

      // recomecar: false porque esta geração faz parte da mesma cadeia de recusas
      await this.quickGenerate({ recomecar: false })
   },

   // recado dentro do card do look, no mesmo lugar onde o erro de geração já aparecia
   mostrarAvisoNoLook(texto) {
      const container = document.getElementById('home-look')
      if (!container) return
      container.innerHTML = `
         <p style="font-size: var(--text-sm); color: var(--text-muted); text-align: center; padding: var(--space-md);">
            ${escapeHtml(texto)}
         </p>
      `
      container.classList.remove('hidden')
   },

   async saveLook(lookId) {
      const btn = document.getElementById('home-btn-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.patch(`/looks/${lookId}/save`)

      if (response?.ok) {
         btn.textContent = 'Salvo!'
         showToast('Look salvo com sucesso')
      } else {
         btn.disabled    = false
         btn.textContent = 'Salvar'
         showToast('Erro ao salvar o look', 'error')
      }
   }
}