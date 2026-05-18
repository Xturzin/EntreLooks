// AUTH - gerencia token e headers de autenticação
const Auth = {
   getToken() {
      return localStorage.getItem('el_token')
   },

   setToken(token) {
      localStorage.setItem('el_token', token)
   },

   clearToken() {
      localStorage.removeItem('el_token')
   },

   isAuthenticated() {
      return !!this.getToken()
   },

   getHeaders() {
      return {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${this.getToken()}`
      }
   }
}