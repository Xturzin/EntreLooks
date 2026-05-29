// ANALYTICS - helper centralizado de rastreamento
// Todos os eventos passam por aqui. Para trocar de provider, só mexe neste arquivo.

const Analytics = {
   isDev: ['127.0.0.1', 'localhost'].includes(window.location.hostname),

   // método base - todos os eventos passam aqui
   track(event, properties = {}) {
      if (this.isDev) {
         console.log(`[analytics] ${event}`, properties)
         return
      }

      if (typeof window.va === 'function') {
         try {
            window.va('event', { name: event, ...properties })
         } catch (e) {
            // falha silenciosa: analytics nunca deve quebrar o app
         }
      }
   },

   // --- eventos tipados ---

   pageView(page) {
      this.track('page_view', { page })
   },

   generateLook(mode, hasWeather = false) {
      this.track('generate_look', { mode, has_weather: hasWeather })
   },

   saveLook(mode) {
      this.track('save_look', { mode })
   },

   rejectLook(mode) {
      this.track('reject_look', { mode })
   },

   uploadCloth() {
      this.track('upload_cloth')
   },

   aiChatMessage() {
      this.track('ai_chat_message')
   },

   onboardingFinished(skipped = false) {
      this.track('onboarding_finished', { skipped })
   }
}