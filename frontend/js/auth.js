// AUTH - gerencia token e headers de autenticação
const Auth = {
   getToken() {
      return localStorage.getItem('el_token')
   },

   getRefreshToken() {
      return localStorage.getItem('el_refresh')
   },

   // Grava os dois tokens de uma vez. O access vence em uma hora e o refresh serve
   // pra pegar um novo sem passar pelo login. O refresh só é sobrescrito quando vem
   // um valor novo, pra uma resposta sem ele não apagar o que já estava guardado.
   setSession(token, refreshToken) {
      localStorage.setItem('el_token', token)
      if (refreshToken) localStorage.setItem('el_refresh', refreshToken)
   },

   // Os dois somem juntos: um access sem refresh não renova, e um refresh sem access
   // não serve pra nada. Deixar só um pela metade confunde o fluxo de entrada.
   clearSession() {
      localStorage.removeItem('el_token')
      localStorage.removeItem('el_refresh')
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