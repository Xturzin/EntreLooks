const OnboardingPage = {
   currentSlide: 0,
   totalSlides:  3,

   render() {
      return `
         <div class="onboarding-overlay" id="onboarding-overlay">

            <div class="onboarding-header">
               <button class="onboarding-skip" id="onboarding-skip">Pular</button>
            </div>

            <div class="onboarding-slides">

               <div class="onboarding-slide active" data-slide="0">
                  <div class="onboarding-icon">
                     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H5v10a2 2 0 002 2h10a2 2 0 002-2V10h1.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/>
                     </svg>
                  </div>
                  <p class="onboarding-brand">EntreLooks</p>
                  <h1 class="onboarding-title">Seu guarda-roupa, mais inteligente</h1>
                  <p class="onboarding-desc">Adicione suas roupas e deixa a IA criar looks completos pra você. Todo dia, sem esforço.</p>
               </div>

               <div class="onboarding-slide" data-slide="1">
                  <h2 class="onboarding-title">Como funciona</h2>
                  <div class="onboarding-features">
                     <div class="onboarding-feature">
                        <div class="feature-icon">
                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                              <line x1="12" y1="8" x2="12" y2="16"/>
                              <line x1="8" y1="12" x2="16" y2="12"/>
                           </svg>
                        </div>
                        <div>
                           <p class="feature-title">Cadastre suas roupas</p>
                           <p class="feature-desc">Foto rápida e a IA organiza tudo automaticamente</p>
                        </div>
                     </div>
                     <div class="onboarding-feature">
                        <div class="feature-icon">
                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                           </svg>
                        </div>
                        <div>
                           <p class="feature-title">IA cria seus looks</p>
                           <p class="feature-desc">Combinações baseadas no seu estilo e no clima do dia</p>
                        </div>
                     </div>
                     <div class="onboarding-feature">
                        <div class="feature-icon">
                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                           </svg>
                        </div>
                        <div>
                           <p class="feature-title">Aprende com você</p>
                           <p class="feature-desc">Quanto mais usa, mais acertado fica</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div class="onboarding-slide" data-slide="2">
                  <div class="onboarding-icon">
                     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                     </svg>
                  </div>
                  <h1 class="onboarding-title">Pronto para começar?</h1>
                  <p class="onboarding-desc">Adicione sua primeira peça e veja a mágica acontecer.</p>
               </div>

            </div>

            <div class="onboarding-footer">
               <div class="onboarding-dots" id="onboarding-dots">
                  <div class="onboarding-dot active"></div>
                  <div class="onboarding-dot"></div>
                  <div class="onboarding-dot"></div>
               </div>
               <button class="btn-primary onboarding-next" id="onboarding-next">Próximo</button>
            </div>

         </div>
      `
   },

   init() {
      this.currentSlide = 0
      document.getElementById('onboarding-skip').addEventListener('click', () => this.finish(true))
      document.getElementById('onboarding-next').addEventListener('click', () => this.next())
   },

   next() {
      if (this.currentSlide < this.totalSlides - 1) {
         this.goTo(this.currentSlide + 1)
      } else {
         this.finish()
      }
   },

   goTo(index) {
      const slides  = document.querySelectorAll('.onboarding-slide')
      const dots    = document.querySelectorAll('.onboarding-dot')
      const nextBtn = document.getElementById('onboarding-next')

      slides[this.currentSlide].classList.add('exit')
      setTimeout(() => slides[this.currentSlide].classList.remove('active', 'exit'), 300)

      this.currentSlide = index

      setTimeout(() => slides[index].classList.add('active'), 60)

      dots.forEach((dot, i) => dot.classList.toggle('active', i === index))

      nextBtn.textContent = index === this.totalSlides - 1
         ? 'Adicionar primeira roupa'
         : 'Próximo'
   },

   finish(skipped = false) {
      localStorage.setItem('el_onboarded', 'true')
      Analytics.onboardingFinished(skipped)

      const overlay            = document.getElementById('onboarding-overlay')
      overlay.style.transition = 'opacity 0.3s ease'
      overlay.style.opacity    = '0'

      setTimeout(() => {
         overlay.remove()
         navigate('wardrobe')
      }, 300)
   }
}