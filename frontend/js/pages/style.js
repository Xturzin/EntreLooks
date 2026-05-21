const COLOR_MAP = {
   preto:    "#1C1C1E", branco:   "#F5F5F5", cinza:    "#8E8E93",
   azul:     "#007AFF", vermelho: "#FF3B30", verde:    "#34C759",
   amarelo:  "#FFD60A", laranja:  "#FF9500", rosa:     "#FF2D55",
   roxo:     "#AF52DE", marrom:   "#A2845E", bege:     "#E8D5B7",
   vinho:    "#7B1C2A", navy:     "#1B2A4A", caramelo: "#C19A6B",
}

function colorHex(name) {
   return COLOR_MAP[(name || "").toLowerCase().trim()] || "#CCCCCC"
}

const StylePage = {
   render() {
      return `
         <div class="page style-page">
            <div class="page-header style-header">
               <div>
                  <h1 class="page-title">Meu Estilo</h1>
                  <p class="page-subtitle">Seu DNA visual</p>
               </div>
               <button class="logout-btn" id="logout-btn">Sair</button>
            </div>
            <div id="style-content">
               <p style="color: var(--text-muted); font-size: var(--text-sm);">Carregando...</p>
            </div>
         </div>
      `
   },

   async init() {
      document.getElementById('logout-btn').addEventListener('click', () => logout())
      await this.load()
   },

   async load() {
      const response = await API.get('/style/')
      if (!response) return

      if (!response.ok) {
         document.getElementById('style-content').innerHTML =
            `<p style="color: var(--text-muted); font-size: var(--text-sm);">Erro ao carregar perfil.</p>`
         return
      }

      this.renderProfile(await response.json())
   },

   renderProfile(data) {
      const container = document.getElementById('style-content')

      if (data.total === 0) {
         container.innerHTML = `
            <p style="color: var(--text-muted); font-size: var(--text-sm);">
               Adicione roupas ao armário para ver seu perfil de estilo.
            </p>
         `
         return
      }

      const summaryBlock = data.summary
         ? `<div class="style-summary">${data.summary}</div>`
         : `
            <div class="style-summary-placeholder">
               <p>Seu resumo de estilo ainda não foi gerado.</p>
               <button class="btn-primary" id="btn-generate-summary">Analisar meu estilo</button>
            </div>
         `

      container.innerHTML = `
         ${summaryBlock}

         <div class="stat-row">
            <div class="stat-card">
               <div class="stat-number">${data.total}</div>
               <div class="stat-label">peças no armário</div>
            </div>
            <div class="stat-card">
               <div class="stat-number">${data.top_styles[0]?.name || '-'}</div>
               <div class="stat-label">estilo predominante</div>
            </div>
         </div>

         ${data.dominant_colors.length > 0 ? `
            <div class="style-section">
               <p class="style-section-title">Cores dominantes</p>
               <div class="color-list">
                  ${data.dominant_colors.map(c => `
                     <div class="color-row">
                        <span class="color-dot" style="background: ${colorHex(c.name)}"></span>
                        <span class="color-name">${c.name}</span>
                        <div class="color-bar-wrap">
                           <div class="color-bar" style="width: ${c.percentage}%"></div>
                        </div>
                        <span class="color-pct">${c.percentage}%</span>
                     </div>
                  `).join('')}
               </div>
            </div>
         ` : ''}

         ${data.top_styles.length > 0 ? `
            <div class="style-section">
               <p class="style-section-title">Estilos</p>
               <div class="tag-list">
                  ${data.top_styles.map(s => `
                     <span class="style-tag">
                        ${s.name}<span class="tag-pct">${s.percentage}%</span>
                     </span>
                  `).join('')}
               </div>
            </div>
         ` : ''}

         ${data.top_types.length > 0 ? `
            <div class="style-section">
               <p class="style-section-title">Tipos de peça</p>
               <div class="tag-list">
                  ${data.top_types.map(t => `
                     <span class="style-tag">
                        ${t.name}<span class="tag-pct">${t.count}</span>
                     </span>
                  `).join('')}
               </div>
            </div>
         ` : ''}

         ${data.summary ? `
            <button class="btn-generate" id="btn-generate-summary">Atualizar análise</button>
         ` : ''}
      `

      document.getElementById('btn-generate-summary')?.addEventListener('click', () => this.generate())
   },

   async generate() {
      const btn = document.getElementById('btn-generate-summary')
      btn.disabled    = true
      btn.textContent = 'Analisando...'

      const response = await API.post('/style/generate', {})
      if (!response) return

      if (!response.ok) {
         btn.disabled    = false
         btn.textContent = 'Tentar novamente'
         return
      }

      this.renderProfile(await response.json())
   }
}