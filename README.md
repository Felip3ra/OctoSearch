<div align="center">
  <img src="site/logo-256.png" width="128" alt="OctoSearch" />
  <h1>OctoSearch</h1>
  <p>Visualizador e pesquisador de arquivos de log para Windows — qualquer aplicação, linguagem ou servidor.</p>
  <p><a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe"><b>⬇ Baixar para Windows</b></a></p>
</div>

## Recursos

- Pesquisa com inclusão (Enter) e exclusão (Shift+Enter) de termos, combinados com E/OU
- Filtros salvos com nome, organizados em grupos
- Filtro por nível: ERR, WRN, INF, DBG
- Vários arquivos mesclados em ordem cronológica
- Abertura de pastas inteiras (com subpastas) e pastas salvas em abas
- Marcadores coloridos por texto, modo claro/escuro, auto-rolagem
- 100% offline e atualização automática pelo GitHub Releases

Manual completo, com prints: https://octosearch-omega.vercel.app/manual

## Histórico de versões

### 1.0.2 — em preparação

- Novo logo do OctoSearch (o polvo detetive) no topo da janela do aplicativo, no lugar do ícone genérico de lupa.

### 1.0.1 — 14/10/2026

- **E/OU entre os termos de busca:** o conector entre dois termos incluídos alterna entre OU e E com um clique. O E agrupa antes do OU, e os termos ligados por E aparecem juntos numa moldura: `(payment E timeout) OU 502`.
- **Incluir ↔ excluir pelo chip:** clicar no texto de um filtro troca entre incluir e excluir; o `×` remove.
- **Filtros salvos:** novo botão *Filtros salvos* para guardar termos, conectores e nível com um nome e um grupo opcional, com busca, aplicar, renomear, mover de grupo, renomear grupo e excluir.
- Publicação: a release é criada antes do envio dos arquivos, evitando a falha de envio em paralelo da 1.0.0.

### 1.0.0 — 07/10/2026

Primeira versão pública.

- Abertura de pastas inteiras, com subpastas e caminhos de rede, em abas com apelido; as abas abertas são restauradas ao reabrir.
- Pastas salvas e favoritas, com histórico e cadastro manual de caminhos.
- Lista de arquivos em árvore com seleção múltipla (Ctrl/Shift) e menus de contexto.
- Visão mesclada: vários arquivos em ordem cronológica, cada um com sua cor.
- Busca com inclusão e exclusão de termos, filtro por nível e limite de registros (primeiros/últimos).
- Stack traces agrupadas e expansíveis, cópia de registros e prévia lateral do log.
- Marcadores coloridos por texto, quebra de linha, tema claro/escuro.
- Tempo real com auto-rolagem.
- Reconhecimento automático de formatos (Serilog, log4net, NLog, JSON por linha, entre outros).
- Instalador e versão portátil para Windows, com atualização automática pelo GitHub Releases.

## Desenvolvimento

Pré-requisito: [Node.js](https://nodejs.org) LTS.

```bash
npm install --legacy-peer-deps
npm run dev        # interface no navegador (http://localhost:3000)
npm run desktop    # app Electron (rode "npm run build" antes)
```

## Gerar e publicar uma versão

1. Aumente `version` no `package.json` e descreva as mudanças em **Histórico de versões**, acima.
2. Rode `publicar-atualizacao.bat` e informe um token do GitHub com permissão *Contents: write*.

O instalador e o portátil vão para o GitHub Releases, e quem usa o instalador recebe a atualização automaticamente.

## Site de download

A pasta [`site/`](site) é a página estática publicada na Vercel (Root Directory = `site`). Veja [site/README.md](site/README.md).
