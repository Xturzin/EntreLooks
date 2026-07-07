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
      this._data = data

      if (data.total === 0) {
         container.innerHTML = `
            <p style="color: var(--text-muted); font-size: var(--text-sm);">
               Adicione roupas ao armário para ver seu perfil de estilo.
            </p>
         `
         return
      }

      const summaryBlock = data.summary
         ? `<div class="style-summary"></div>`
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

         ${data.top_occasions?.length > 0 ? `
            <div class="style-section">
               <p class="style-section-title">Ocasiões</p>
               <div class="tag-list">
                  ${data.top_occasions.map(o => `
                     <span class="style-tag">
                        ${o.name}<span class="tag-pct">${o.percentage}%</span>
                     </span>
                  `).join('')}
               </div>
            </div>
         ` : ''}

         ${data.summary ? `
            <button class="btn-generate" id="btn-generate-summary">Atualizar análise</button>
         ` : ''}

         <button class="btn-secondary btn-share-style" id="btn-share-style">Compartilhar meu estilo</button>
      `

      if (data.summary) {
         const summaryEl = container.querySelector('.style-summary')
         if (summaryEl) summaryEl.textContent = data.summary
      }

      document.getElementById('btn-generate-summary')?.addEventListener('click', () => this.generate())
      document.getElementById('btn-share-style')?.addEventListener('click', () => this.shareStyle())
   },

   async generate() {
      const btn = document.getElementById('btn-generate-summary')
      btn.disabled    = true
      btn.textContent = 'Analisando...'

      const response = await API.post('/style/generate', {})
      if (!response) return

      if (!response.ok) {
         const err = await response.json().catch(() => ({}))
         showToast(err.detail || 'Erro ao gerar análise. Tente novamente.', 'error')
         btn.disabled    = false
         btn.textContent = 'Tentar novamente'
         return
      }

      this.renderProfile(await response.json())
   },

   _downloadBlob(blob, name) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
   },

   // gera um cartão do DNA de estilo (resumo, cores dominantes, estilos) pra compartilhar
   async shareStyle() {
      const data = this._data
      if (!data || !data.total) return

      const btn       = document.getElementById('btn-share-style')
      btn.disabled    = true
      btn.textContent = 'Gerando imagem...'

      try {
         const W = 1080, H = 1350, M = 100
         const canvas  = document.createElement('canvas')
         canvas.width  = W
         canvas.height = H
         const ctx = canvas.getContext('2d')

         ctx.fillStyle = '#F5F8F1'
         ctx.fillRect(0, 0, W, H)

         ctx.textAlign = 'center'
         ctx.fillStyle = '#C75D7E'
         ctx.font = "700 42px 'Segoe UI', Arial, sans-serif"
         ctx.fillText('EntreLooks', W / 2, 100)

         ctx.fillStyle = '#252E20'
         ctx.font = "800 76px 'Segoe UI', Arial, sans-serif"
         ctx.fillText('Meu estilo', W / 2, 196)

         // quebra o texto do resumo em várias linhas pra caber na largura
         const wrap = (text, x, y, maxW, lh) => {
            const words = text.split(' ')
            let line = ''
            for (const w of words) {
               const test = line ? line + ' ' + w : w
               if (ctx.measureText(test).width > maxW && line) {
                  ctx.fillText(line, x, y); y += lh; line = w
               } else line = test
            }
            if (line) { ctx.fillText(line, x, y); y += lh }
            return y
         }

         // desenha uma pílula arredondada (fundo das tags de estilo)
         const pill = (x, y, w, h, r) => {
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.arcTo(x + w, y, x + w, y + h, r)
            ctx.arcTo(x + w, y + h, x, y + h, r)
            ctx.arcTo(x, y + h, x, y, r)
            ctx.arcTo(x, y, x + w, y, r)
            ctx.closePath()
         }

         let y = 290
         ctx.textAlign = 'left'

         if (data.summary) {
            ctx.fillStyle = '#4C6E48'
            ctx.font = "500 34px 'Segoe UI', Arial, sans-serif"
            y = wrap(data.summary, M, y, W - 2 * M, 48) + 34
         }

         const colors = data.dominant_colors || []
         if (colors.length) {
            ctx.fillStyle = '#252E20'
            ctx.font = "700 38px 'Segoe UI', Arial, sans-serif"
            ctx.fillText('Cores que eu mais uso', M, y); y += 62
            colors.slice(0, 5).forEach(c => {
               ctx.fillStyle = colorHex(c.name)
               ctx.beginPath(); ctx.arc(M + 20, y - 12, 20, 0, Math.PI * 2); ctx.fill()
               ctx.strokeStyle = '#E3E9DC'; ctx.lineWidth = 2; ctx.stroke()
               ctx.fillStyle = '#252E20'
               ctx.font = "600 32px 'Segoe UI', Arial, sans-serif"
               ctx.fillText(`${c.name}  ${c.percentage}%`, M + 64, y)
               y += 56
            })
            y += 28
         }

         const styles = data.top_styles || []
         if (styles.length) {
            ctx.fillStyle = '#252E20'
            ctx.font = "700 38px 'Segoe UI', Arial, sans-serif"
            ctx.fillText('Meus estilos', M, y); y += 60
            let tx = M
            ctx.font = "600 30px 'Segoe UI', Arial, sans-serif"
            styles.slice(0, 5).forEach(s => {
               const w = ctx.measureText(s.name).width + 44
               if (tx + w > W - M) { tx = M; y += 66 }
               ctx.fillStyle = '#EFF4EA'
               pill(tx, y - 38, w, 52, 26); ctx.fill()
               ctx.fillStyle = '#4C6E48'
               ctx.fillText(s.name, tx + 22, y)
               tx += w + 16
            })
         }

         ctx.textAlign = 'center'
         ctx.fillStyle = '#7C8876'
         ctx.font = "600 32px 'Segoe UI', Arial, sans-serif"
         ctx.fillText(`${data.total} peças no meu armário`, W / 2, H - 80)

         const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
         if (!blob) throw new Error('sem imagem')
         const file = new File([blob], 'estilo-entrelooks.png', { type: 'image/png' })

         if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
               await navigator.share({ files: [file], title: 'Meu estilo' })
            } catch (e) {
               if (e.name !== 'AbortError') this._downloadBlob(blob, 'estilo-entrelooks.png')
            }
         } else {
            this._downloadBlob(blob, 'estilo-entrelooks.png')
         }
      } catch (e) {
         showToast('Não consegui gerar a imagem agora. Tente um print.', 'error')
      } finally {
         btn.disabled    = false
         btn.textContent = 'Compartilhar meu estilo'
      }
   }
}