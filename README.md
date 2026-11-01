<div align="center">
  <img src="site/logo-256.png" width="128" alt="OctoSearch" />
  <h1>OctoSearch</h1>
  <p>Visualizador e pesquisador de arquivos de log para Windows e Linux: qualquer aplicação, linguagem ou servidor.</p>
  <p>
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe"><b>⬇ Windows</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-x86_64.AppImage"><b>⬇ Linux (AppImage)</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-amd64.deb"><b>⬇ Linux (.deb)</b></a>
  </p>
</div>

## Recursos

- Pesquisa com inclusão (Enter) e exclusão (Shift+Enter) de termos, combinados com E/OU
- Termos com expressão regular e com diferenciação de maiúsculas e minúsculas
- Filtro por período (De/Até ou os últimos 15 min, 1 h, 6 h, 24 h e 7 dias do log)
- Exportação dos registros filtrados para `.log` ou `.csv` (Excel)
- Filtros salvos com nome, organizados em grupos
- Filtro por nível: ERR, WRN, INF, DBG
- Vários arquivos mesclados em ordem cronológica
- Abertura de pastas inteiras (com subpastas) e pastas salvas em abas
- Rotações compactadas (`app.log.1.gz`) e detecção de codificação (UTF-8, UTF-16, Windows-1252)
- Tempo real que lê só as linhas novas; arquivos acima de 200 MB são abertos pelo final
- Marcadores coloridos por texto, modo claro/escuro, auto-rolagem
- 100% offline e atualização automática pelo GitHub Releases (instalador do Windows e AppImage)

Manual completo, com prints: https://octosearch-omega.vercel.app/manual

## Histórico de versões

### 1.1.0 — 01/11/2026

**Novidades**

- **Versão para Linux:** AppImage (qualquer distribuição, com atualização automática) e `.deb` (Ubuntu/Debian).
- **Busca com expressão regular** (botão `.*`) e **diferenciando maiúsculas** (botão `Aa`). Uma expressão inválida é sinalizada antes de virar filtro.
- **Filtro por período:** botão *Período* com De/Até e atalhos que contam a partir do registro mais recente do log.
- **Exportar:** salva os registros visíveis em `.log` ou em `.csv` com BOM e separador `;`, prontos para o Excel.
- **Arquivos `.gz`:** rotações compactadas aparecem na lista e são descompactadas ao abrir.
- **Codificação automática:** UTF-8 (com ou sem BOM), UTF-16 e Windows-1252, sem acentos quebrados.

**Desempenho**

- O processamento dos logs saiu da tela e foi para um Web Worker: a janela continua respondendo enquanto arquivos grandes são lidos.
- O tempo real lê só o trecho acrescentado ao arquivo e processa só as linhas novas. Rotação ou truncamento faz o arquivo ser relido por inteiro.
- O tempo real é avisado pelo sistema (`fs.watch`) quando o arquivo muda e ainda confere de tempos em tempos, porque esses avisos falham em pastas de rede.
- Arquivos acima de 200 MB são abertos pelo final (os registros mais recentes), com aviso na tela.
- Listas com milhões de registros agora rolam até o fim (antes o navegador limitava a altura) e atualizam bem mais rápido.

**Segurança**

- O aplicativo só lê arquivos de log (`.log`, `.txt`, `.gz`) dentro de pastas que o usuário escolheu ou autorizou. Pastas salvas antes desta versão são liberadas automaticamente uma única vez.
- Sandbox do Chromium ativada, Content Security Policy na interface, bloqueio de navegação, de janelas novas e de `<webview>`, e todos os pedidos de permissão negados, menos a cópia para a área de transferência.
- DevTools disponível só no desenvolvimento (ou com `OCTOSEARCH_DEVTOOLS=1`).

**Qualidade**

- Testes automatizados com Vitest (parser, busca, mesclagem, exportação, codificação, worker e controle de acesso), executados também no pipeline.
- Lint com oxlint (incluindo as regras de hooks do React).
- `App.tsx` dividido em hooks (`useLogLoader`, `usePersistedState`) e componentes (`TimeRangeFilter`, `ExportMenu`).
- Removidas as sobras do template do AI Studio (`.env.example`, `metadata.json`, `bun.lock`).

### 1.0.2

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

Pipeline de seguranca no Azure DevOps: veja [configuracao, execucao e relatorios](docs/pentest-pipeline.md).

Pré-requisito: [Node.js](https://nodejs.org) LTS.

```bash
npm install --legacy-peer-deps
npm run dev        # interface no navegador (http://localhost:3000)
npm run desktop    # app Electron (rode "npm run build" antes)
npm test           # testes (Vitest)
npm run lint       # tipos (tsc) + oxlint
```

Estrutura principal:

| Caminho | O que é |
|---|---|
| `electron/main.cjs` | Processo principal: janela, IPC, controle de acesso às pastas, tempo real e atualização |
| `electron/folderAccess.cjs` | Pastas liberadas e verificação de caminho (testado em `folderAccess.test.ts`) |
| `src/services/logParser.ts` | Parser de formatos e sessão incremental (`LogParseSession`) |
| `src/services/parseWorkerCore.ts` | Lógica do Web Worker: decodificação, `.gz`, parse e acréscimos |
| `src/hooks/useLogLoader.ts` | Leitura, parse no worker e tempo real dos arquivos selecionados |
| `src/services/logSearch.ts` | Filtros (E/OU, regex, maiúsculas, período, nível, limite) e destaque |

## Gerar e publicar uma versão

1. Aumente `version` no `package.json` e descreva as mudanças em **Histórico de versões**, acima.
2. Rode `publicar-atualizacao.bat` e informe um token do GitHub com permissão *Contents: write*.

O instalador e o portátil vão para o GitHub Releases, e quem usa o instalador recebe a atualização automaticamente.
Quando a release é publicada, o workflow [`release-linux.yml`](.github/workflows/release-linux.yml) gera o AppImage e o `.deb` num runner Ubuntu e os anexa à mesma release.
Para gerar os pacotes Linux localmente, rode `npm run build:linux` num Linux (ou no WSL/Docker; no Windows o AppImage não pode ser criado).

### Assinatura de código

O instalador ainda não é assinado, por isso o SmartScreen avisa na primeira execução. Com um certificado de assinatura de código, basta definir `CSC_LINK` (arquivo `.pfx` ou base64) e `CSC_KEY_PASSWORD` antes de rodar o `publicar-atualizacao.bat`: o electron-builder assina o instalador e o portátil sozinho.

## Site de download

A pasta [`site/`](site) é a página estática publicada na Vercel (Root Directory = `site`). Veja [site/README.md](site/README.md).
