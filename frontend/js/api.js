// API - wrapper centralizado para todas as chamadas ao backend
const API = {
   async request(endpoint, options = {}) {
      const isFormData = options.body instanceof FormData

      const headers = isFormData
         ? { 'Authorization': `Bearer ${Auth.getToken()}` }
         : Auth.getHeaders()

      const response = await fetch(CONFIG.API_URL + endpoint, {
         ...options,
         headers: { ...headers, ...options.headers }
      })

      // token inválido ou expirado: redireciona para login
      if (response.status === 401) {
         Auth.clearToken()
         showAuthPage()
         return null
      }

      return response
   },

   get(endpoint) {
      return this.request(endpoint)
   },

   post(endpoint, body) {
      const isFormData = body instanceof FormData
      return this.request(endpoint, {
         method: 'POST',
         body:   isFormData ? body : JSON.stringify(body)
      })
   },

   patch(endpoint) {
      return this.request(endpoint, { method: 'PATCH' })
   }
}