// ROUTER - gerencia navegação entre páginas
const routes = {
   home:     HomePage,
   wardrobe: WardrobePage,
   looks:    LooksPage,
   ai:       AIPage,
   style:    StylePage,
}

// nome que a pessoa escolheu (fica na conta). Usado nas saudações e no chat.
let USER_NAME = null

function setUserName(name) {
   USER_NAME = name || null
}

// só o primeiro nome, pra saudação ficar leve ("Bom dia, Ana")
function greetingName() {
   return USER_NAME ? USER_NAME.trim().split(' ')[0] : null
}

function navigate(page) {
   if (!routes[page]) return

   document.getElementById('page-content').innerHTML = routes[page].render()
   routes[page].init?.()

   document.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.page === page)
   })

   // hash routing: permite Vercel distinguir tabs + navegação por URL
   history.replaceState(null, '', `#${page}`)
}

function showAuthPage() {
   document.getElementById('auth-view').innerHTML = LoginPage.render()
   LoginPage.init()
   document.getElementById('auth-view').classList.remove('hidden')
   document.getElementById('app').classList.add('hidden')
}

async function showApp() {
   document.getElementById('auth-view').classList.add('hidden')

   // pega o nome guardado na conta pra saudação já sair certa
   const meRes = await API.get('/auth/me')
   // se o token venceu, o 401 já mandou pro login; não segue mostrando o app
   if (!Auth.isAuthenticated()) return
   if (meRes?.ok) setUserName((await meRes.json()).name)

   // mostra o app já aqui. O onboarding e a Dora aparecem por cima numa camada
   // flutuante, e quando a Dora manda pro armário o container precisa estar visível,
   // senão a navegação desenha numa tela escondida e fica tudo branco.
   document.getElementById('app').classList.remove('hidden')

   // restaura tab da URL se existir
   const hashPage = window.location.hash.replace('#', '')

   if (!localStorage.getItem('el_onboarded')) {
      const response = await API.get('/clothes/')

      // null = token expirado, API.request já redirecionou para login
      if (!response) return

      const clothes = response.ok ? await response.json() : []

      if (clothes.length === 0) {
         showOnboarding()
         return
      }

      localStorage.setItem('el_onboarded', 'true')
   }

   const targetPage = routes[hashPage] ? hashPage : 'home'
   navigate(targetPage)
}

function showOnboarding() {
   const wrapper     = document.createElement('div')
   wrapper.innerHTML = OnboardingPage.render()
   document.body.appendChild(wrapper.firstElementChild)
   OnboardingPage.init()
}

function logout() {
   Auth.clearToken()
   localStorage.removeItem('el_onboarded')
   AIPage.history = []
   showAuthPage()
}

// TOAST - notificação global
function showToast(message, type = 'success') {
   const existing = document.getElementById('app-toast')
   if (existing) existing.remove()

   const toast       = document.createElement('div')
   toast.id          = 'app-toast'
   toast.className   = `toast${type === 'error' ? ' toast-error' : ''}`
   toast.textContent = message
   document.body.appendChild(toast)

   requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast-visible'))
   })

   setTimeout(() => {
      toast.classList.remove('toast-visible')
      setTimeout(() => toast.remove(), 300)
   }, 2500)
}

// LOADING MESSAGES - rotação de mensagens durante geração
const LOOK_MESSAGES = [
   'Analisando seu armário...',
   'Combinando cores e estilos...',
   'Pensando no clima...',
   'Montando algo especial...',
   'Quase lá...',
]

let _msgInterval = null

function startMsgRotation(elementId, messages = LOOK_MESSAGES) {
   const el = document.getElementById(elementId)
   if (!el) return
   let i = 0
   el.textContent = messages[0]
   _msgInterval = setInterval(() => {
      i = (i + 1) % messages.length
      const target = document.getElementById(elementId)
      if (target) target.textContent = messages[i]
   }, 1800)
}

function stopMsgRotation(elementId, originalText) {
   clearInterval(_msgInterval)
   _msgInterval = null
   const el = document.getElementById(elementId)
   if (el) el.textContent = originalText
}

// Volta do login social: o Supabase devolve o token (ou um erro) no fim da URL,
// depois do #. A gente pega o token, guarda e limpa a URL antes de seguir.
function captureOAuthRedirect() {
   const hash = window.location.hash
   if (!hash || (!hash.includes('access_token=') && !hash.includes('error='))) return

   const params = new URLSearchParams(hash.substring(1))
   const token  = params.get('access_token')
   const error  = params.get('error_description') || params.get('error')

   // tira o token da URL pra não ficar exposto nem atrapalhar o roteamento por hash
   history.replaceState(null, '', window.location.pathname)

   if (token) {
      Auth.setToken(token)
   } else if (error) {
      // login cancelado ou com falha: avisa assim que a tela montar
      setTimeout(() => showToast('Não foi possível entrar com o Google. Tente de novo.', 'error'), 300)
   }
}

// liga os botões da barra de baixo à troca de tela
document.querySelectorAll('#bottom-nav .tab-item').forEach(tab => {
   tab.addEventListener('click', () => navigate(tab.dataset.page))
})

// inicializa verificando autenticação
captureOAuthRedirect()

if (Auth.isAuthenticated()) {
   showApp()
} else {
   showAuthPage()
}