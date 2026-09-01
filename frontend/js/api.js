// API - wrapper centralizado para todas as chamadas ao backend

// Renovação em andamento. Guardar a promessa aqui faz as chamadas que tomaram 401
// ao mesmo tempo esperarem a MESMA renovação em vez de cada uma disparar a sua.
// Isso é necessário porque o Supabase rotaciona o refresh token: duas renovações
// em paralelo invalidam o token uma da outra e a pessoa cairia no login mesmo
// tendo sessão válida.
let _renovacaoEmAndamento = null

// Rotas de credencial. Um 401 vindo delas é resposta legítima (senha errada, refresh
// vencido), não sessão expirada. Tentar renovar em cima disso viraria laço infinito.
const ROTAS_SEM_RENOVACAO = ['/auth/login', '/auth/signup', '/auth/refresh']

function _podeRenovar(endpoint) {
   return !ROTAS_SEM_RENOVACAO.some(rota => endpoint.startsWith(rota))
}

// Vai no backend trocar o refresh token por um par novo e guarda o que voltou.
// Devolve true se a sessão foi renovada. Usa fetch direto, e não API.request,
// pra não correr o risco de reentrar no tratamento de 401 daqui.
async function _renovarSessao() {
   const refreshToken = Auth.getRefreshToken()
   if (!refreshToken) return false

   try {
      const response = await fetch(CONFIG.API_URL + '/auth/refresh', {
         method:  'POST',
         headers: { 'Content-Type': 'application/json' },
         body:    JSON.stringify({ refresh_token: refreshToken })
      })

      if (!response.ok) return false

      const data = await response.json()
      if (!data.access_token || !data.refresh_token) return false

      Auth.setSession(data.access_token, data.refresh_token)
      return true
   } catch (e) {
      return false  // rede caiu no meio da renovação
   }
}

// Garante uma renovação por vez. Quem chegar enquanto uma está rodando aguarda a
// mesma promessa e aproveita o resultado dela.
function _renovarSessaoUmaVez() {
   if (!_renovacaoEmAndamento) {
      _renovacaoEmAndamento = _renovarSessao().finally(() => {
         _renovacaoEmAndamento = null
      })
   }
   return _renovacaoEmAndamento
}

const API = {
   // Uma tentativa isolada: monta os headers com o token que está valendo agora e
   // cria o próprio timeout. Está separado do request() porque a retentativa depois
   // de renovar precisa de header e timeout novos, não dá pra reaproveitar os da
   // primeira tentativa (o token mudou e o timer anterior já foi encerrado).
   async _tentativa(endpoint, options, externalSignal) {
      const isFormData = options.body instanceof FormData

      const headers = isFormData
         ? { 'Authorization': `Bearer ${Auth.getToken()}` }
         : Auth.getHeaders()

      const controller = externalSignal ? null : new AbortController()
      const signal     = externalSignal || controller.signal
      const timeout    = controller ? setTimeout(() => controller.abort(), 30000) : null

      try {
         return await fetch(CONFIG.API_URL + endpoint, {
            ...options,
            headers: { ...headers, ...options.headers },
            signal
         })
      } finally {
         if (timeout) clearTimeout(timeout)
      }
   },

   async request(endpoint, options = {}) {
      const externalSignal = options.signal

      try {
         let response = await this._tentativa(endpoint, options, externalSignal)

         // 401 aqui costuma ser só o access token vencido. Tendo refresh guardado,
         // renova e refaz a chamada uma única vez antes de desistir da sessão.
         if (response.status === 401 && _podeRenovar(endpoint) && Auth.getRefreshToken()) {
            const renovou = await _renovarSessaoUmaVez()

            if (renovou) {
               response = await this._tentativa(endpoint, options, externalSignal)
            }
         }

         // continuou 401 depois de renovar, ou não havia refresh pra tentar:
         // aí a sessão acabou mesmo e a pessoa volta pro login
         if (response.status === 401 && _podeRenovar(endpoint)) {
            Auth.clearSession()
            showAuthPage()
            return null
         }

         return response
      } catch (e) {
         if (e.name === 'AbortError' && !externalSignal) return null
         if (e.name === 'AbortError') throw e  // sinal externo (ex: Mira) — deixa o caller tratar
         return null  // erros de rede (TypeError: Failed to fetch, etc.)
      }
   },

   get(endpoint) {
      return this.request(endpoint)
   },

   post(endpoint, body, signal = null) {
      const isFormData = body instanceof FormData
      const options    = {
         method: 'POST',
         body:   isFormData ? body : JSON.stringify(body)
      }
      if (signal) options.signal = signal
      return this.request(endpoint, options)
   },

   patch(endpoint, body = null) {
      const options = { method: 'PATCH' }
      if (body) options.body = JSON.stringify(body)
      return this.request(endpoint, options)
   },

   delete(endpoint) {
      return this.request(endpoint, { method: 'DELETE' })
   }
}