// Tela de boas-vindas da Dora, logo depois do onboarding. Ela se apresenta e
// pergunta o nome da pessoa. O nome é salvo na conta (via /auth/me) pra o app
// falar de um jeito mais próximo depois. Dá pra pular sem responder.
const DoraWelcome = {
   show() {
      const wrapper     = document.createElement('div')
      wrapper.innerHTML = this.render()
      document.body.appendChild(wrapper.firstElementChild)
      this.init()
   },

   render() {
      return `
         <div class="dora-welcome" id="dora-welcome">
            <div class="dora-welcome-inner">
               <div class="dora-avatar">D</div>
               <div class="dora-bubble">
                  <p>Oi, eu sou a Dora</p>
                  <p>Sua estilista aqui do EntreLooks. Como você gostaria que eu te chamasse?</p>
               </div>
               <div class="dora-form">
                  <input type="text" id="dora-name" placeholder="Seu nome" autocomplete="given-name" maxlength="40">
                  <button class="btn-primary" id="dora-save">Continuar</button>
                  <button class="dora-skip" id="dora-skip">Agora não</button>
               </div>
            </div>
         </div>
      `
   },

   init() {
      const input = document.getElementById('dora-name')
      setTimeout(() => input.focus(), 400)

      document.getElementById('dora-save').addEventListener('click', () => this.save())
      document.getElementById('dora-skip').addEventListener('click', () => this.finish())
      input.addEventListener('keydown', (e) => {
         if (e.key === 'Enter') this.save()
      })
   },

   async save() {
      const name = document.getElementById('dora-name').value.trim()

      // sem nome é o mesmo que pular, não trava a pessoa na entrada
      if (!name) {
         this.finish()
         return
      }

      const btn       = document.getElementById('dora-save')
      btn.disabled    = true
      btn.textContent = 'Salvando...'

      const response = await API.patch('/auth/me', { name })
      if (response?.ok) {
         const data = await response.json()
         setUserName(data.name)
      }

      // mesmo se salvar falhar, segue em frente pra não prender ninguém aqui
      this.finish()
   },

   // só fecha o véu. O app já está aberto atrás (o onboarding navegou antes de chamar a Dora).
   finish() {
      const overlay = document.getElementById('dora-welcome')
      if (overlay) {
         overlay.style.opacity = '0'
         setTimeout(() => overlay.remove(), 300)
      }
   }
}
