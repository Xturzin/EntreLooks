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
                  <div class="password-field">
                     <input type="password" id="auth-password" placeholder="Senha" autocomplete="current-password">
                     <button type="button" class="password-toggle" id="password-toggle" aria-label="Mostrar senha">
                        <svg class="icon-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                           <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
                           <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <svg class="icon-off" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                           <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                           <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                     </button>
                  </div>
                  <p id="auth-error" class="auth-error hidden"></p>
                  <button id="auth-submit" class="btn-primary">Entrar</button>
               </div>

               <div class="auth-divider"><span>ou</span></div>

               <button class="btn-google" id="google-login">
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                     <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                     <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                     <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                     <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                  </svg>
                  Entrar com Google
               </button>
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
      document.getElementById('password-toggle').addEventListener('click', () => this.togglePassword())
      document.getElementById('google-login').addEventListener('click', () => this.loginWithGoogle())
   },

   // manda a pessoa pro Google via Supabase. Ao voltar, o token vem no fim da URL
   // e o app.js captura (função captureOAuthRedirect).
   loginWithGoogle() {
      const redirectTo = encodeURIComponent(window.location.origin)
      window.location.href =
         `${CONFIG.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`
   },

   // olhinho: alterna entre esconder e mostrar a senha
   togglePassword() {
      const input = document.getElementById('auth-password')
      const btn   = document.getElementById('password-toggle')
      const show  = input.type === 'password'

      input.type = show ? 'text' : 'password'
      btn.classList.toggle('revealed', show)
      btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha')
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

      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 30000)

      try {
         const endpoint = this.mode === 'login' ? '/auth/login' : '/auth/signup'
         const response = await fetch(CONFIG.API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: controller.signal
         })

         const data = await response.json()

         if (!response.ok) {
            this.showError(data.detail || 'Algo deu errado')
            return
         }

         if (this.mode === 'signup') {
            this.showSuccess('Conta criada! Agora entre com seus dados.')
            document.querySelector('[data-mode="login"]').click()
            return
         }

         Auth.setSession(data.token, data.refresh_token)
         showApp()

      } catch (e) {
         this.showError(e.name === 'AbortError' ? 'A requisição demorou demais. Tente novamente.' : 'Erro de conexão com o servidor')
      } finally {
         clearTimeout(timeout)
         btn.disabled    = false
         btn.textContent = this.mode === 'login' ? 'Entrar' : 'Criar conta'
      }
   },

   showError(msg) {
      const el = document.getElementById('auth-error')
      el.textContent = msg
      el.className   = 'auth-error'
      el.classList.remove('hidden')
   },

   showSuccess(msg) {
      const el = document.getElementById('auth-error')
      el.textContent = msg
      el.className   = 'auth-success'
      el.classList.remove('hidden')
   }
}