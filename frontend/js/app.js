// ROUTER - gerencia navegação entre páginas
const routes = {
   home:     HomePage,
   wardrobe: WardrobePage,
   looks:    LooksPage,
   ai:       AIPage,
   style:    StylePage,
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
   Analytics.pageView(page)
}

function showAuthPage() {
   document.getElementById('auth-view').innerHTML = LoginPage.render()
   LoginPage.init()
   document.getElementById('auth-view').classList.remove('hidden')
   document.getElementById('app').classList.add('hidden')
}

async function showApp() {
   document.getElementById('auth-view').classList.add('hidden')
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

// inicializa verificando autenticação
if (Auth.isAuthenticated()) {
   showApp()
} else {
   showAuthPage()
}