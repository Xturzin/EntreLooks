// SERVICE WORKER DO ENTRELOOKS
//
// >>>>> SUBA A CONSTANTE VERSAO ABAIXO A CADA DEPLOY QUE MEXER EM CSS, JS OU NO HTML <<<<<
//
// Isso nao e formalidade. O navegador decide se ha atualizacao comparando os BYTES
// deste arquivo. Se ele nao mudar, nada e instalado e as pessoas continuam recebendo os
// arquivos antigos do cache pra sempre, mesmo com o deploy novo no ar. Mudar a VERSAO e
// o que faz os bytes diferirem e o que troca o nome do cache.
//
// ------------------------------------------------------------------------------------
// EMERGENCIA: como desinstalar isto de todo mundo, remotamente.
//
// Se este service worker quebrar em producao, troque o conteudo INTEIRO do arquivo pelas
// linhas abaixo e suba o deploy. O navegador sempre rebusca o /sw.js na rede, entao todo
// mundo pega a versao de despejo no proximo carregamento e sai limpo, sem precisar mexer
// em nenhum aparelho. Repare que ela nao tem handler de fetch: depois do activate
// nenhuma requisicao passa mais por aqui.
//
//    self.addEventListener('install', () => self.skipWaiting())
//
//    self.addEventListener('activate', (event) => {
//       event.waitUntil((async () => {
//          const nomes = await caches.keys()
//          await Promise.all(nomes.map((nome) => caches.delete(nome)))
//          await self.registration.unregister()
//          const abas = await self.clients.matchAll({ type: 'window' })
//          abas.forEach((aba) => aba.navigate(aba.url))
//       })())
//    })
// ------------------------------------------------------------------------------------

const VERSAO = 'v3'
const CACHE  = `entrelooks-${VERSAO}`

// O que e guardado. Sao os arquivos que o index.html carrega em toda visita, ou seja, o
// app inteiro: nao existe um subconjunto "so o necessario pra abrir" porque nenhum dos
// scripts e condicional.
//
// Ficam de fora de proposito:
//   - PNG dos icones: quem busca eles e o sistema operacional na hora de instalar, e
//     nessa hora ha internet. Guardar aqui seria peso morto, e um 404 em qualquer item
//     desta lista aborta a instalacao inteira.
//   - fontes do Google: sao de outra origem. Buscar em modo no-cors devolve resposta
//     opaca, que nao deixa distinguir um 200 de um erro, e um erro gravado envenena o
//     cache em silencio. Ficam com o cache HTTP do navegador, e o display=swap na URL
//     garante que offline o texto aparece na fonte do sistema em vez de sumir.
//   - robots.txt e vercel.json: o app nunca pede.
const ARQUIVOS = [
   '/index.html',
   '/manifest.json',
   '/assets/icons/favicon.svg',

   '/css/reset.css',
   '/css/variables.css',
   '/css/main.css',
   '/css/components/navbar.css',
   '/css/components/auth.css',
   '/css/components/wardrobe.css',
   '/css/components/looks.css',
   '/css/components/onboarding.css',
   '/css/components/style.css',
   '/css/components/home.css',
   '/css/components/ai.css',

   '/js/config.js',
   '/js/auth.js',
   '/js/api.js',
   '/js/pages/login.js',
   '/js/pages/onboarding.js',
   '/js/pages/mira-welcome.js',
   '/js/pages/home.js',
   '/js/pages/wardrobe.js',
   '/js/pages/looks.js',
   '/js/pages/ai.js',
   '/js/pages/style.js',
   '/js/app.js',
]

// Set porque o handler de fetch consulta isso em toda requisicao da propria origem.
const CAMINHOS = new Set(ARQUIVOS)

// Ultimo recurso da navegacao. So aparece se o cache tiver sido esvaziado por fora
// (cota estourada, limpeza manual) com o registro do service worker ainda de pe.
const PAGINA_OFFLINE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>EntreLooks sem conexao</title>
   <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center;
             justify-content: center; background: #F5F8F1; color: #4C6E48;
             font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p  { font-size: 15px; margin: 0; opacity: .8; }
   </style>
</head>
<body>
   <div>
      <h1>Voce esta sem conexao</h1>
      <p>Abra o EntreLooks de novo quando a internet voltar.</p>
   </div>
</body>
</html>`

// Monta o cache da versao nova em bloco. O cache: 'reload' em cada item e obrigatorio:
// sem ele a busca passaria pelo cache HTTP do navegador, e como o CSS e o JS sao
// servidos com max-age de uma hora e sem hash no nome, a instalacao poderia gravar
// arquivos velhos e congelar eles aqui pra sempre.
//
// O addAll e tudo ou nada. Se um item falhar, o install rejeita, este service worker e
// descartado e o anterior continua no comando. E o que a gente quer: melhor ficar na
// versao antiga inteira do que numa versao pela metade.
self.addEventListener('install', (event) => {
   event.waitUntil(
      caches.open(CACHE)
         .then((cache) => cache.addAll(
            ARQUIVOS.map((caminho) => new Request(caminho, { cache: 'reload' }))
         ))
         .then(() => self.skipWaiting())
   )
})

// Apaga os caches das versoes anteriores e assume o controle das abas ja abertas. O
// clients.claim e o que dispara o controllerchange que o index.html escuta pra
// recarregar a pagina uma vez.
self.addEventListener('activate', (event) => {
   event.waitUntil(
      caches.keys()
         .then((nomes) => Promise.all(
            nomes.filter((nome) => nome !== CACHE).map((nome) => caches.delete(nome))
         ))
         .then(() => self.clients.claim())
   )
})

// Navegacao: rede primeiro. O HTML precisa vir fresco, senao uma pessoa online ficaria
// presa numa versao antiga da pagina. O cache aqui e rede de seguranca, nao atalho.
async function responderNavegacao(request) {
   try {
      return await fetch(request)
   } catch (erro) {
      // rede fora, segue pro cache
   }

   try {
      const guardado = await caches.match('/index.html', { cacheName: CACHE })
      if (guardado) return guardado
   } catch (erro) {
      // Cache ilegivel acontece de verdade: cota estourada, aba anonima, storage
      // corrompido. Nao pode escapar daqui, entao cai na pagina offline.
   }

   return new Response(PAGINA_OFFLINE, {
      status:  200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
   })
}

// Arquivo estatico da lista: cache primeiro. Como o cache inteiro e trocado de uma vez
// na instalacao, tudo que sai daqui pertence a mesma versao. Nao ha revalidacao em
// segundo plano de proposito: ela poderia atualizar um arquivo e nao outro, e ai o
// looks.css de ontem tentaria estilizar o looks.js de hoje.
async function responderArquivo(request) {
   try {
      const guardado = await caches.match(request, { cacheName: CACHE })
      if (guardado) return guardado
   } catch (erro) {
      // cache ilegivel, tenta a rede
   }

   try {
      return await fetch(request)
   } catch (erro) {
      // Nao existe conteudo de reserva razoavel pra um CSS ou JS solto. Devolver 504 e
      // melhor que deixar a promessa rejeitar, porque rejeicao aqui vira "erro do
      // service worker" no console e esconde a causa real, que e a rede.
      return new Response('', { status: 504, statusText: 'Sem conexao' })
   }
}

// Decide por eliminacao. Toda regra que nao chama respondWith deixa a requisicao seguir
// o caminho normal do navegador, como se este arquivo nao existisse.
self.addEventListener('fetch', (event) => {
   const requisicao = event.request

   // 1. So GET. Um POST de upload de roupa ou um DELETE de look nunca encostam no cache.
   if (requisicao.method !== 'GET') return

   const url = new URL(requisicao.url)

   // 2. So a propria origem. E esta linha que garante que nenhuma chamada de API e
   // cacheada: o backend, o Storage do Supabase, o Open-Meteo e o esm.sh do removedor de
   // fundo estao todos em outros dominios. A regra e de permitidos, nao de proibidos,
   // entao rota nova de API nao precisa ser lembrada aqui.
   if (url.origin !== self.location.origin) return

   // 3. Abrir o app.
   if (requisicao.mode === 'navigate') {
      event.respondWith(responderNavegacao(requisicao))
      return
   }

   // 4. Arquivo que a gente guardou.
   if (CAMINHOS.has(url.pathname)) {
      event.respondWith(responderArquivo(requisicao))
      return
   }

   // 5. Resto da propria origem: nao intercepta.
})