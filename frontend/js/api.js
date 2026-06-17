// API - wrapper centralizado para todas as chamadas ao backend
const API = {
   async request(endpoint, options = {}) {
      const isFormData     = options.body instanceof FormData
      const externalSignal = options.signal

      const headers = isFormData
         ? { 'Authorization': `Bearer ${Auth.getToken()}` }
         : Auth.getHeaders()

      const controller = externalSignal ? null : new AbortController()
      const signal     = externalSignal || controller.signal
      const timeout    = controller ? setTimeout(() => controller.abort(), 30000) : null

      try {
         const response = await fetch(CONFIG.API_URL + endpoint, {
            ...options,
            headers: { ...headers, ...options.headers },
            signal
         })

         // token inválido ou expirado: redireciona para login
         if (response.status === 401) {
            Auth.clearToken()
            showAuthPage()
            return null
         }

         return response
      } catch (e) {
         if (e.name === 'AbortError' && !externalSignal) return null
         if (e.name === 'AbortError') throw e  // sinal externo (ex: Dora) — deixa o caller tratar
         return null  // erros de rede (TypeError: Failed to fetch, etc.)
      } finally {
         if (timeout) clearTimeout(timeout)
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

   patch(endpoint) {
      return this.request(endpoint, { method: 'PATCH' })
   },

   delete(endpoint) {
      return this.request(endpoint, { method: 'DELETE' })
   }
}