const AIPage = {
   history: [],

   render() {
      return `
         <div class="page ai-page">
            <div class="page-header">
               <h1 class="page-title">Estilista IA</h1>
               <p class="page-subtitle">Dora, sua consultora de moda</p>
            </div>
            <div class="chat-messages" id="chat-messages">
               <div class="chat-bubble ai">
                     Oi! Sou a Dora, sua estilista pessoal. Posso te ajudar a montar looks, dar dicas de estilo ou responder qualquer dúvida de moda. Como posso te ajudar hoje?
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
      this.history = []

      const input   = document.getElementById('chat-input')
      const sendBtn = document.getElementById('chat-send')

      sendBtn.addEventListener('click', () => this.send())

      input.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            this.send()
         }
      })
   },

   async send() {
      const input   = document.getElementById('chat-input')
      const sendBtn = document.getElementById('chat-send')
      const message = input.value.trim()

      if (!message) return

      input.value       = ''
      sendBtn.disabled  = true

      this.addBubble('user', message)
      const loadingId = this.addBubble('ai', 'Pensando...', true)

      this.history.push({ role: 'user', content: message })

      try {
         const response = await fetch(`${CONFIG.API_URL}/ai/chat`, {
            method:  'POST',
            headers: Auth.getHeaders(),
            body:    JSON.stringify({
               message,
               history: this.history.slice(-10)
            })
         })

         if (!response.ok) throw new Error()

         const data = await response.json()

         this.removeBubble(loadingId)
         this.addBubble('ai', data.reply)

         this.history.push({ role: 'assistant', content: data.reply })

      } catch (e) {
         this.removeBubble(loadingId)
         this.addBubble('ai', 'Tive um problema aqui. Pode repetir?')
      } finally {
         sendBtn.disabled = false
         input.focus()
      }
   },

   addBubble(role, content, isLoading = false) {
      const messages = document.getElementById('chat-messages')
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