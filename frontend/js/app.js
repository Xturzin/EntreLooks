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
}

function showAuthPage() {
   document.getElementById('auth-view').innerHTML = LoginPage.render()
   LoginPage.init()
   document.getElementById('auth-view').classList.remove('hidden')
   document.getElementById('app').classList.add('hidden')
}

function showApp() {
   document.getElementById('auth-view').classList.add('hidden')
   document.getElementById('app').classList.remove('hidden')
   navigate('home')
}

function logout() {
   Auth.clearToken()
   showAuthPage()
}

// eventos das tabs
document.querySelectorAll('.tab-item').forEach(tab => {
   tab.addEventListener('click', () => navigate(tab.dataset.page))
})

// inicializa verificando autenticação
if (Auth.isAuthenticated()) {
   showApp()
} else {
   showAuthPage()
}