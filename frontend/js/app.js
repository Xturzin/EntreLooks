// ROUTER - gerencia navegação entre páginas
const routes = {
   home:     HomePage,
   wardrobe: WardrobePage,
   looks:    LooksPage,
   ai:       AIPage,
   style:    StylePage,
}

// Escapa texto antes de ele entrar num innerHTML. Precisamos disso porque boa parte
// do que a tela mostra é texto livre: o apelido e o nome que a pessoa digita, e os
// campos que a IA preenche (tipo, cor, estilo, ocasião), que o banco aceita sem trava.
// Sem escapar, um "<img onerror=...>" salvo como apelido roda junto com o app, e como
// o token fica no localStorage a sessão vai junto.
// A ordem importa: o & vem primeiro, senão ele escaparia de novo o & das trocas seguintes.
function escapeHtml(valor) {
   if (valor === null || valor === undefined || valor === '') return ''

   return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
}

// nome que a pessoa escolheu (fica na conta). Usado nas saudações e no chat.
let USER_NAME = null

function setUserName(name) {
   USER_NAME = name || null

   // A saudação da home pode já estar na tela escrita sem o nome, porque o /auth/me
   // deixou de ser esperado antes de abrir o app. Se ela estiver visível, reescreve
   // agora que o nome chegou. O setupGreeting recalcula tudo a partir do relógio,
   // então chamar de novo é seguro. Se a pessoa já trocou de aba, o elemento não
   // está mais na tela e não há o que corrigir, então sai sem fazer nada.
   if (document.getElementById('greeting-label')) HomePage.setupGreeting()
}

// só o primeiro nome, pra saudação ficar leve ("Bom dia, Ana")
function greetingName() {
   return USER_NAME ? USER_NAME.trim().split(' ')[0] : null
}

// clima de agora. A home busca uma vez e a Mira reaproveita no chat, pra ela não
// sugerir casaco em dia de 35 graus.
let USER_WEATHER = null

function setWeather(weather) {
   USER_WEATHER = weather || null
}

function getWeather() {
   return USER_WEATHER
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

   // Pede o nome, mas não espera. Ele serve só pra saudação virar "Boa tarde, Ana"
   // em vez de "Boa tarde", e segurar a tela por causa disso custava uns 450ms de app
   // escondido: é uma ida e volta até o Supabase, que fica longe do nosso servidor.
   // Quando a resposta chega, o setUserName reescreve a saudação sozinho.
   //
   // Sessão vencida não precisa de tratamento aqui. O API.request tenta renovar com o
   // refresh token e, se nem isso resolver, ele mesmo limpa a sessão e chama a tela de
   // login, que esconde o #app de volta. Por isso o retorno nem é olhado: se veio null,
   // a pessoa já está indo pro login.
   API.get('/auth/me').then(async (resposta) => {
      if (resposta?.ok) setUserName((await resposta.json()).name)
   })

   // mostra o app já aqui. O onboarding e a Mira aparecem por cima numa camada
   // flutuante, e quando a Mira manda pro armário o container precisa estar visível,
   // senão a navegação desenha numa tela escondida e fica tudo branco.
   document.getElementById('app').classList.remove('hidden')

   // restaura tab da URL se existir
   const hashPage = window.location.hash.replace('#', '')

   if (!localStorage.getItem('el_onboarded')) {
      const response = await API.get('/clothes/')

      // O null chega aqui por dois motivos bem diferentes. Um deles é a sessão ter
      // acabado de vez: nesse caso o API.request já limpou os tokens e chamou a tela de
      // login, então não sobra nada pra fazer aqui. O outro é a rede ter caído, e aí a
      // pessoa continua logada. Sair aqui nesse segundo caso deixaria o #app visível com
      // o conteúdo vazio, ou seja, tela branca, e isso passou a acontecer de verdade
      // depois do service worker, que faz o app abrir mesmo sem internet.
      // Quem separa os dois é a sessão ainda estar de pé, porque só o caminho de
      // sessão expirada apaga ela.
      if (!response && !Auth.isAuthenticated()) return

      // Sem resposta e ainda logado é rede fora. Não dá pra saber se o armário está
      // vazio, então pula o onboarding e segue pra home: mostrar as boas-vindas pra quem
      // já tem roupas cadastradas seria pior que mostrar a home sem os números.
      if (response) {
         const clothes = response.ok ? await response.json() : []

         if (clothes.length === 0) {
            showOnboarding()
            return
         }

         localStorage.setItem('el_onboarded', 'true')
      }
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
   Auth.clearSession()
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

// Volta do login social: o Supabase devolve os tokens (ou um erro) no fim da URL,
// depois do #. A gente pega, guarda e limpa a URL antes de seguir.
function captureOAuthRedirect() {
   const hash = window.location.hash
   if (!hash || (!hash.includes('access_token=') && !hash.includes('error='))) return

   const params       = new URLSearchParams(hash.substring(1))
   const token        = params.get('access_token')
   // o refresh vem no mesmo hash; sem guardar ele, quem entra pelo Google fica
   // uma hora logado e cai no login igual antes
   const refreshToken = params.get('refresh_token')
   const error        = params.get('error_description') || params.get('error')

   // tira os tokens da URL pra não ficarem expostos nem atrapalhar o roteamento por hash
   history.replaceState(null, '', window.location.pathname)

   if (token) {
      Auth.setSession(token, refreshToken)
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