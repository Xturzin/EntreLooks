const AIPage = {
   history: [],

   render() {
      // cumprimenta pelo nome se a pessoa tiver dito à Mira no começo
      const name = greetingName()
      const hi   = name ? `Oi, ${escapeHtml(name)}! ` : 'Oi! '

      return `
         <div class="page ai-page">
            <div class="page-header">
               <h1 class="page-title">Estilista IA</h1>
               <p class="page-subtitle">Mira, sua consultora de moda</p>
            </div>
            <div class="chat-messages" id="chat-messages">
               <div class="chat-bubble ai">
                  ${hi}Sou a Mira, sua estilista pessoal. Posso te ajudar a montar looks, dar dicas de estilo ou responder qualquer dúvida de moda. Como posso te ajudar hoje?
               </div>
            </div>
         </div>
         <div class="chat-input-area">
            <input type="text" id="chat-input" placeholder="Pergunte algo...">
            <button class="chat-send-btn" id="chat-send">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
               </svg>
            </button>
         </div>
      `
   },

   init() {
      // não reseta history aqui para preservar conversa entre navegações

      const input   = document.getElementById('chat-input')
      const sendBtn = document.getElementById('chat-send')

      sendBtn.addEventListener('click', () => this.send())
      input.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            this.send()
         }
      })

      this.restoreHistory()
   },

   restoreHistory() {
      if (this.history.length === 0) return

      const messages = document.getElementById('chat-messages')
      this.history.forEach(msg => {
         const div       = document.createElement('div')
         div.className   = `chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`
         div.textContent = msg.content
         messages.appendChild(div)

         // Trocar de aba destrói o DOM do chat e ele é remontado a partir daqui, então a
         // sugestão precisa ser redesenhada junto, senão ela some ao ir no Armário e voltar.
         if (msg.sugestao) this.renderSugestao(div, msg.sugestao)
         else if (msg.pecas) this.renderPecas(div, msg.pecas)
      })
      messages.scrollTop = messages.scrollHeight
   },

   async send() {
      const input   = document.getElementById('chat-input')
      const sendBtn = document.getElementById('chat-send')
      const message = input.value.trim()

      if (!message) return

      input.value      = ''
      sendBtn.disabled = true

      this.addBubble('user', message)
      const loadingId = this.addBubble('ai', 'Pensando...', true)
      this.history.push({ role: 'user', content: message })

      // limita histórico: mantém apenas os últimos 10 pares (20 mensagens)
      if (this.history.length > 20) {
         this.history = this.history.slice(-20)
      }

      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 30000)

      try {
         const response = await API.post(
            '/ai/chat',
            {
               message,
               // O history daqui guarda a sugestão pendurada em cada mensagem, pra ela
               // sobreviver à troca de aba. O backend só conhece role e content, então
               // o que vai pra IA é uma cópia enxuta.
               history: this.history.slice(-10).map(m => ({ role: m.role, content: m.content })),
               weather: getWeather()
            },
            controller.signal
         )

         if (response?.ok) {
            const data    = await response.json()
            const bolhaId = this.addBubble('ai', data.reply)

            // Os dois campos são opcionais e nunca vêm juntos: sugestao é o look inteiro
            // com botão de montar, pecas é a foto de uma peça que ela citou. Quando nenhum
            // vem, a bolha fica como sempre foi.
            const bolha = document.getElementById(bolhaId)
            if (data.sugestao) this.renderSugestao(bolha, data.sugestao)
            else if (data.pecas) this.renderPecas(bolha, data.pecas)

            this.history.push({
               role:     'assistant',
               content:  data.reply,
               sugestao: data.sugestao || null,
               pecas:    data.pecas || null
            })
         } else if (response) {
            this.history.pop()
            const err    = await response.json().catch(() => ({}))
            const detail = err.detail || 'Tive um problema aqui. Pode repetir?'
            this.addBubble('ai', detail)
         }

      } catch (e) {
         this.history.pop()
         const msg = e.name === 'AbortError'
            ? 'A resposta demorou demais. Tente novamente.'
            : 'Erro de conexão. Tente novamente.'
         this.addBubble('ai', msg)
      } finally {
         clearTimeout(timeout)
         this.removeBubble(loadingId)
         sendBtn.disabled = false
         input.focus()
      }
   },

   // Tira de miniaturas embaixo da bolha, com o botão que leva o look pra aba Montar.
   // O formato é o mesmo do card de look da Home, e não a colagem de sete espaços da aba
   // Looks: numa bolha de chat, que tem uns 280px, os espaços de acessório da colagem
   // ficariam pequenos demais pra distinguir um colar de um óculos.
   renderSugestao(bolha, sugestao) {
      if (!bolha || !sugestao?.clothes?.length) return

      const bloco     = document.createElement('div')
      bloco.className = 'chat-look'
      bloco.innerHTML = `
         <div class="chat-look-clothes">
            ${sugestao.clothes.map(c => `
               <div class="chat-look-item">
                  <img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.type || '')}">
               </div>
            `).join('')}
         </div>
         <button class="chat-look-btn">Montar esse look</button>
      `

      bolha.insertAdjacentElement('afterend', bloco)

      bloco.querySelector('.chat-look-btn').addEventListener('click', () => {
         // A aba Montar lê isso quando terminar de carregar as peças. Passar só os ids
         // basta: a sugestão é ponto de partida, não look salvo, então não precisa de
         // linha no banco.
         LooksPage.sugestaoPendente = sugestao.clothes_ids
         navigate('looks')
      })

      const messages = document.getElementById('chat-messages')
      if (messages) messages.scrollTop = messages.scrollHeight
   },

   // A peça que a Mira marcou com a linha "Peça:". É de propósito um desenho diferente da
   // sugestão de look: sem botão, miniatura menor e o nome embaixo.
   //
   // O motivo é que as duas coisas pedem ações diferentes. A sugestão de look é um convite
   // pra fazer algo (montar), então ela tem botão e miniatura grande. A peça citada é
   // ilustração do que ela acabou de dizer, então ela só precisa ser reconhecível. Dar
   // botão aqui faria a pessoa achar que é sugestão de look de uma peça só.
   renderPecas(bolha, pecas) {
      if (!bolha || !pecas?.length) return

      const bloco     = document.createElement('div')
      bloco.className = 'chat-pecas'
      bloco.innerHTML = pecas.map(c => `
         <figure class="chat-peca">
            <img src="${escapeHtml(urlMiniatura(c.image_url, 64, 64))}"
                 onerror="this.onerror=null;this.src='${escapeHtml(c.image_url)}'"
                 alt="${escapeHtml(c.type || '')}" loading="lazy">
            <figcaption>${escapeHtml([c.type, c.color].filter(Boolean).join(' '))}</figcaption>
         </figure>
      `).join('')

      bolha.insertAdjacentElement('afterend', bloco)

      const messages = document.getElementById('chat-messages')
      if (messages) messages.scrollTop = messages.scrollHeight
   },

   addBubble(role, content, isLoading = false) {
      const messages = document.getElementById('chat-messages')
      if (!messages) return null

      const id       = `bubble-${Date.now()}-${Math.random()}`

      const div       = document.createElement('div')
      div.id          = id
      div.className   = `chat-bubble ${role}${isLoading ? ' loading' : ''}`
      div.textContent = content

      messages.appendChild(div)
      messages.scrollTop = messages.scrollHeight

      return id
   },

   removeBubble(id) {
      document.getElementById(id)?.remove()
   }
}