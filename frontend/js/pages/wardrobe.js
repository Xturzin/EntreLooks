const WardrobePage = {
   selectedFile:  null,
   clothes:       [],
   activeFilter:  'all',
   _offset:       0,
   _limit:        50,
   _hasMore:      false,
   _loading:      false,

   render() {
      return `
         <div class="page">
            <div class="page-header">
               <h1 class="page-title">Armário</h1>
               <p class="page-subtitle">Suas roupas</p>
            </div>

            <div id="wardrobe-stats"></div>

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

            <div class="filter-bar hidden" id="filter-bar"></div>
            <div class="clothes-grid" id="clothes-grid"></div>
         </div>
      `
   },

   async init() {
      this.selectedFile = null
      this.activeFilter = 'all'
      this._offset      = 0
      this._hasMore     = false
      this.clothes      = []
      this.bindUploadEvents()
      await Promise.all([this.loadStats(), this.loadClothes()])
   },

async loadStats() {
      const response = await API.get('/clothes/stats')
      if (!response?.ok) return

      const data      = await response.json()
      const container = document.getElementById('wardrobe-stats')

      if (data.total === 0) return

      const mostWornBlock = data.most_worn.length > 0 ? `
         <p class="wardrobe-stats-title">Mais usadas</p>
         <div class="mini-grid">
            ${data.most_worn.map(c => `
               <div class="mini-card">
                  <img src="${c.image_url}" alt="${c.type || ''}">
                  <div class="mini-card-badge">${c.wear_count}x</div>
               </div>
            `).join('')}
         </div>
      ` : ''

      const neverWornBlock = data.never_worn.length > 0 ? `
         <p class="wardrobe-stats-title">Esquecidas (${data.never_worn_count})</p>
         <div class="mini-grid">
            ${data.never_worn.map(c => `
               <div class="mini-card">
                  <img src="${c.image_url}" alt="${c.type || ''}">
               </div>
            `).join('')}
         </div>
      ` : ''

      container.innerHTML = `
         <div class="wardrobe-stats">
            <div class="stats-summary">
               <div class="stats-card">
                  <div class="stats-card-number">${data.total}</div>
                  <div class="stats-card-label">peças</div>
               </div>
               <div class="stats-card">
                  <div class="stats-card-number">${data.never_worn_count}</div>
                  <div class="stats-card-label">esquecidas</div>
               </div>
            </div>
            ${mostWornBlock}
            ${neverWornBlock}
         </div>
         ${data.total > 0 ? '<div class="wardrobe-divider"></div>' : ''}
      `
   },

   bindUploadEvents() {
      const input = document.getElementById('cloth-input')
      document.getElementById('upload-trigger').addEventListener('click', () => input.click())

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

      const btn     = document.getElementById('upload-submit')
      const trigger = document.getElementById('upload-trigger')
      const status  = document.getElementById('upload-status')

      btn.disabled       = true
      btn.textContent    = 'Processando...'
      trigger.disabled   = true
      status.className   = 'upload-status'
      status.textContent = 'Removendo fundo e identificando a peça...'
      status.classList.remove('hidden')

      try {
         const formData = new FormData()
         formData.append('file', this.selectedFile)

         const response = await API.post('/clothes/', formData)

         if (!response) return

         if (!response.ok) {
            const err          = await response.json().catch(() => ({}))
            status.className   = 'upload-status error'
            status.textContent = err.detail || 'Algo deu errado. Tente de novo.'
         } else {
            const cloth        = await response.json()
            status.className   = 'upload-status success'
            status.textContent = `"${cloth.type || 'Peça'}" salva no armário!`
            showToast(`${cloth.type || 'Peça'} adicionada ao armário`)
            Analytics.uploadCloth()
            this.resetUpload()
            await this.loadClothes()
         }
      } finally {
         btn.disabled     = false
         btn.textContent  = 'Salvar no armário'
         trigger.disabled = false
      }
   },

   resetUpload() {
      this.selectedFile = null
      document.getElementById('cloth-input').value     = ''
      document.getElementById('upload-preview').classList.add('hidden')
      document.getElementById('upload-submit').disabled    = false
      document.getElementById('upload-submit').textContent = 'Salvar no armário'
   },

   async loadClothes(append = false) {
      if (this._loading && append) return
      this._loading = true

      if (!append) {
         this._offset = 0
         this.clothes = []
         this.renderSkeletonGrid()
      }

      try {
         const response = await API.get(`/clothes/?limit=${this._limit}&offset=${this._offset}`)
         if (!response) return

         const page    = response.ok ? await response.json() : []
         this._hasMore = page.length === this._limit
         this.clothes  = append ? [...this.clothes, ...page] : page

         this.renderFilters()
         this.applyFilter()
      } finally {
         this._loading = false
      }
   },

   async loadMore() {
      this._offset += this._limit
      await this.loadClothes(true)
   },

   renderSkeletonGrid() {
      const grid = document.getElementById('clothes-grid')
      grid.innerHTML = Array(6).fill(0).map(() => `
         <div class="skeleton-card">
            <div class="skeleton" style="width:100%;aspect-ratio:3/4"></div>
            <div style="padding:var(--space-sm)">
               <div class="skeleton" style="height:13px;width:55%;margin-bottom:6px"></div>
               <div class="skeleton" style="height:11px;width:35%"></div>
            </div>
         </div>
      `).join('')
   },

   renderFilters() {
      const bar = document.getElementById('filter-bar')

      if (this.clothes.length === 0) {
         bar.classList.add('hidden')
         return
      }

      const types = ['all', ...new Set(this.clothes.map(c => c.type).filter(Boolean))]

      bar.innerHTML = types.map(type => `
         <button class="filter-pill ${type === this.activeFilter ? 'active' : ''}" data-filter="${type}">
            ${type === 'all' ? 'Todas' : type}
         </button>
      `).join('')

      bar.classList.remove('hidden')

      bar.querySelectorAll('.filter-pill').forEach(pill => {
         pill.addEventListener('click', () => {
            this.activeFilter = pill.dataset.filter
            bar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'))
            pill.classList.add('active')
            this.applyFilter()
         })
      })
   },

   applyFilter() {
      const filtered = this.activeFilter === 'all'
         ? this.clothes
         : this.clothes.filter(c => c.type === this.activeFilter)
      this.renderGrid(filtered)
   },

   async deleteCloth(clothId) {
      const response = await API.delete(`/clothes/${clothId}`)
      if (!response?.ok) {
         showToast('Erro ao remover peça', 'error')
         return
      }

      this.clothes = this.clothes.filter(c => c.id !== clothId)
      this.renderFilters()
      this.applyFilter()
      showToast('Peça removida do armário')
   },

   renderGrid(clothes) {
      const grid = document.getElementById('clothes-grid')

      if (clothes.length === 0) {
         grid.innerHTML = `
            <div class="empty-state">
               <p>Seu armário está vazio</p>
               <span>Adicione suas primeiras peças para começar a montar looks</span>
            </div>
         `
         return
      }

      const loadMoreBtn = this._hasMore
         ? `<div class="load-more-wrapper" style="grid-column:1/-1"><button class="btn-secondary" id="load-more-clothes">Carregar mais</button></div>`
         : ''

      grid.innerHTML = clothes.map(cloth => `
         <div class="cloth-card">
            <img src="${cloth.image_url}" alt="${cloth.type || 'Roupa'}" loading="lazy">
            <button class="cloth-delete-btn" data-id="${cloth.id}" aria-label="Remover peça">×</button>
            <div class="cloth-info">
               <span class="cloth-type">${cloth.type || 'Peça'}</span>
               ${cloth.color ? `<span class="cloth-color">${cloth.color}</span>` : ''}
            </div>
         </div>
      `).join('') + loadMoreBtn

      grid.querySelectorAll('.cloth-delete-btn').forEach(btn => {
         btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.deleteCloth(btn.dataset.id)
         })
      })

      if (this._hasMore) {
         document.getElementById('load-more-clothes').addEventListener('click', () => this.loadMore())
      }
   }
}