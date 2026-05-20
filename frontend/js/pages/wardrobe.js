const WardrobePage = {
   selectedFile: null,

   render() {
      return `
         <div class="page">
            <div class="page-header">
               <h1 class="page-title">Armário</h1>
               <p class="page-subtitle">Adicione suas roupas</p>
            </div>

            <div class="upload-area">
               <input type="file" id="cloth-input" accept="image/*" class="hidden">
               <button class="upload-trigger" id="upload-trigger">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                     <circle cx="12" cy="12" r="10"/>
                     <line x1="12" y1="8" x2="12" y2="16"/>
                     <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  <span>Toque para adicionar uma roupa</span>
               </button>
            </div>

            <div class="upload-preview hidden" id="upload-preview">
               <img id="preview-img" src="" alt="Preview da roupa">
               <button class="btn-primary" id="upload-submit">Salvar no armário</button>
               <button class="btn-secondary" id="upload-cancel">Cancelar</button>
            </div>

            <div class="upload-status hidden" id="upload-status"></div>
         </div>
      `
   },

   init() {
      this.selectedFile = null

      const input   = document.getElementById('cloth-input')
      const trigger = document.getElementById('upload-trigger')

      trigger.addEventListener('click', () => input.click())

      input.addEventListener('change', (e) => {
         const file = e.target.files[0]
         if (!file) return
         this.selectedFile = file
         this.showPreview(file)
      })

      document.getElementById('upload-submit').addEventListener('click', () => this.upload())
      document.getElementById('upload-cancel').addEventListener('click', () => this.resetUpload())
   },

   showPreview(file) {
      const reader = new FileReader()
      reader.onload = (e) => {
         document.getElementById('preview-img').src = e.target.result
         document.getElementById('upload-preview').classList.remove('hidden')
         document.getElementById('upload-status').classList.add('hidden')
      }
      reader.readAsDataURL(file)
   },

   async upload() {
      if (!this.selectedFile) return

      const btn    = document.getElementById('upload-submit')
      const status = document.getElementById('upload-status')

      btn.disabled    = true
      btn.textContent = 'Processando...'
      status.className   = 'upload-status'
      status.textContent = 'Removendo fundo e identificando a peça...'
      status.classList.remove('hidden')

      try {
         const formData = new FormData()
         formData.append('file', this.selectedFile)

         const response = await fetch(`${CONFIG.API_URL}/clothes/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
            body: formData
         })

         if (!response.ok) {
            const err = await response.json()
            throw new Error(err.detail || 'Erro ao salvar a roupa')
         }

         const cloth = await response.json()

         status.className   = 'upload-status success'
         status.textContent = `"${cloth.type || 'Peça'}" salva no armário!`
         this.resetUpload()

      } catch (e) {
         status.className   = 'upload-status error'
         status.textContent = e.message || 'Algo deu errado. Tente de novo.'
         btn.disabled    = false
         btn.textContent = 'Salvar no armário'
      }
   },

   resetUpload() {
      this.selectedFile = null
      document.getElementById('cloth-input').value = ''
      document.getElementById('upload-preview').classList.add('hidden')
      document.getElementById('upload-submit').disabled    = false
      document.getElementById('upload-submit').textContent = 'Salvar no armário'
   }
}