const LoginPage = {
   mode: 'login',

   render() {
      return `
         <div class="auth-page">
            <div class="auth-header">
               <h1 class="auth-title">EntreLooks</h1>
               <p class="auth-subtitle">Seu guarda-roupa inteligente</p>
            </div>
            <div class="auth-card">
               <div class="auth-tabs">
                  <button class="auth-tab active" data-mode="login">Entrar</button>
                  <button class="auth-tab" data-mode="signup">Criar conta</button>
               </div>
               <div class="auth-form">
                  <input type="email" id="auth-email" placeholder="seu@email.com" autocomplete="email">
                  <input type="password" id="auth-password" placeholder="Senha" autocomplete="current-password">
                  <p id="auth-error" class="auth-error hidden"></p>
                  <button id="auth-submit" class="btn-primary">Entrar</button>
               </div>
            </div>
         </div>
      `
   },

   init() {
      this.mode = 'login'

      document.querySelectorAll('.auth-tab').forEach(tab => {
         tab.addEventListener('click', () => {
            this.mode = tab.dataset.mode
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'))
            tab.classList.add('active')
            document.getElementById('auth-submit').textContent =
               this.mode === 'login' ? 'Entrar' : 'Criar conta'
            document.getElementById('auth-error').classList.add('hidden')
         })
      })

      document.getElementById('auth-submit').addEventListener('click', () => this.submit())
   },

   async submit() {
      const email    = document.getElementById('auth-email').value.trim()
      const password = document.getElementById('auth-password').value
      const btn      = document.getElementById('auth-submit')

      if (!email || !password) {
         this.showError('Preencha email e senha')
         return
      }

      btn.disabled    = true
      btn.textContent = 'Aguarde...'
      document.getElementById('auth-error').classList.add('hidden')

      try {
         const endpoint = this.mode === 'login' ? '/auth/login' : '/auth/signup'
         const response = await fetch(CONFIG.API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
         })

         const data = await response.json()

         if (!response.ok) {
            this.showError(data.detail || 'Algo deu errado')
            return
         }

         if (this.mode === 'signup') {
            this.showError('Conta criada! Agora entre com seus dados.')
            document.querySelector('[data-mode="login"]').click()
            return
         }

         Auth.setToken(data.token)
         showApp()

      } catch (e) {
         this.showError('Erro de conexão com o servidor')
      } finally {
         btn.disabled    = false
         btn.textContent = this.mode === 'login' ? 'Entrar' : 'Criar conta'
      }
   },

   showError(msg) {
      const el = document.getElementById('auth-error')
      el.textContent = msg
      el.classList.remove('hidden')
   }
}