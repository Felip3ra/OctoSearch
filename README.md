<div align="center">
  <img src="site/logo-256.png" width="128" alt="OctoSearch" />
  <h1>OctoSearch</h1>
  <p>Visualizador e pesquisador de arquivos de log de aplicações .NET para Windows.</p>
  <p><a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe"><b>⬇ Baixar para Windows</b></a></p>
</div>

## Recursos

- Pesquisa com inclusão (Enter) e exclusão (Shift+Enter) de termos
- Filtro por nível: ERR, WRN, INF, DBG
- Vários arquivos mesclados em ordem cronológica
- Abertura de pastas inteiras (com subpastas) e pastas salvas em abas
- Marcadores coloridos por texto, modo claro/escuro, auto-rolagem
- 100% offline e atualização automática pelo GitHub Releases

## Desenvolvimento

Pré-requisito: [Node.js](https://nodejs.org) LTS.

```bash
npm install --legacy-peer-deps
npm run dev        # interface no navegador (http://localhost:3000)
npm run desktop    # app Electron (rode "npm run build" antes)
```

## Gerar e publicar uma versão

1. Aumente `version` no `package.json`.
2. Rode `publicar-atualizacao.bat` e informe um token do GitHub com permissão *Contents: write*.

O instalador e o portátil vão para o GitHub Releases, e quem usa o instalador recebe a atualização automaticamente.

## Site de download

A pasta [`site/`](site) é a página estática publicada na Vercel (Root Directory = `site`). Veja [site/README.md](site/README.md).
