<div align="center">
  <img src="site/logo-256.png" width="128" alt="OctoSearch" />
  <h1>OctoSearch</h1>
  <p>Visualizador e pesquisador de arquivos de log para Windows, Linux e macOS: qualquer aplicação, linguagem ou servidor.</p>
  <p>
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe"><b>⬇ Windows</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-x86_64.AppImage"><b>⬇ Linux (AppImage)</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-amd64.deb"><b>⬇ Linux (.deb)</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-arm64.dmg"><b>⬇ macOS (Apple Silicon)</b></a> ·
    <a href="https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-x64.dmg"><b>⬇ macOS (Intel)</b></a>
  </p>
</div>

## Recursos

- Pesquisa com inclusão (Enter) e exclusão (Shift+Enter) de termos, combinados com E/OU
- Termos com expressão regular e com diferenciação de maiúsculas e minúsculas
- Filtro por campo em logs JSON e `chave=valor`: `$UserId = 81`, `$Elapsed > 1000`, `$RequestPath ~ /api`
- Linha do tempo com erros e avisos por intervalo (arraste para filtrar o período)
- Top erros: mensagens agrupadas ignorando IDs, números, GUIDs e URLs
- Navegação por teclado: `F8` (próximo erro), `Ctrl+B`/`F2` (marcar e ir ao próximo marcado), `Ctrl+G` (ir para a linha)
- Filtro por período (De/Até ou os últimos 15 min, 1 h, 6 h, 24 h e 7 dias do log)
- Exportação dos registros filtrados para `.log` ou `.csv` (Excel)
- Filtros salvos com nome, organizados em grupos
- Filtro por nível: ERR, WRN, INF, DBG
- Vários arquivos mesclados em ordem cronológica
- Abertura de pastas inteiras (com subpastas) e pastas salvas em abas
- Rotações compactadas (`app.log.1.gz`), logs dentro de `.zip` e detecção de codificação (UTF-8, UTF-16, Windows-1252)
- Tempo real que lê só as linhas novas, com aviso do sistema quando surge um erro; arquivos acima de 200 MB são abertos pelo final
- Abrir pelo sistema: duplo clique num `.log`, "Abrir com" ou `OctoSearch caminho/do/arquivo.log`
- Marcadores coloridos por texto, modo claro/escuro, auto-rolagem
- 100% offline e atualização automática pelo GitHub Releases (instalador do Windows e AppImage)

Manual completo, com prints: https://octosearch-omega.vercel.app/manual

## Histórico de versões

### 1.3.0 — 09/11/2026

**Layout**

- **Barra de ferramentas que cabe na janela:** as ferramentas menos usadas (filtros salvos, marcadores, quebra de linha, densidade, painel de detalhes, lista de arquivos) foram para o menu **⋯**, e os rótulos só aparecem em janelas largas.
- **Data no mesmo formato para todos os arquivos**, na hora local (logs JSON em UTC e logs em hora local ficam na ordem certa); o texto original aparece na dica.
- **Colunas alinhadas:** a etiqueta do arquivo e a data têm largura fixa.
- **Painel de detalhes do registro** (Enter, duplo clique ou "Ver detalhes"): mensagem, campos com botões que viram filtro `$campo = valor`, stack trace e registro original, cada um com botão de copiar.
- **Lista de arquivos redimensionável e recolhível**, com a largura salva.
- **Densidade compacta:** linhas de 24 px em vez de 34.
- **Paleta de comandos (`Ctrl+K`):** qualquer ação, aba, pasta salva ou filtro salvo pelo nome, sem se importar com acentos.
- **Responsivo:** da janela mínima (850 px) ao celular (390 px) nenhum controle sai da tela; as barras quebram em linhas, a data mostra só a hora em telas estreitas e a lista de arquivos pode ser recolhida.

**Correção**

- A altura real das linhas (35 px) não batia com a usada para posicioná-las (34 px), e a diferença se acumulava na rolagem. Agora as duas vêm da mesma constante.
- O menu do botão direito de um registro aparecia longe do clique (ou fora da tela) com a lista rolada.

**Manual e site**

- Todas as imagens do manual e do site refeitas com a interface atual, mais o painel de detalhes e a paleta de comandos.

### 1.2.0 — 02/11/2026

**Novidades**

- **Versão para macOS:** `.dmg` para Apple Silicon e para Intel (sem assinatura da Apple: na primeira vez, botão direito → Abrir).
- **Linha do tempo:** gráfico de registros por intervalo, com erros e avisos; clique ou arraste para filtrar o período.
- **Top erros:** agrupa as mensagens de erro (e, se quiser, de aviso) trocando números, IDs, GUIDs, textos entre aspas e URLs por curingas; um clique filtra o grupo ou vai para a última ocorrência.
- **Filtro por campo:** `$campo operador valor` (`=`, `!=`, `>`, `>=`, `<`, `<=`, `~`) em registros JSON (campos aninhados com ponto) e em pares `chave=valor`.
- **Teclado e marcadores:** `F8`/`Shift+F8` vão para o próximo/anterior erro, `Ctrl+B` marca o registro, `F2`/`Shift+F2` percorrem os marcados e `Ctrl+G` vai para uma linha.
- **Avisos do sistema:** com o tempo real ligado e a janela em segundo plano, um novo erro (ou um termo escolhido nas Configurações) gera uma notificação.
- **Logs dentro de `.zip`:** listados como se o zip fosse uma subpasta e descompactados na memória.
- **Abrir pelo sistema:** associação com `.log` (instalador do Windows, `.deb` e macOS), "Abrir com" e linha de comando; com o app aberto, o arquivo abre na mesma janela.

**Desempenho**

- Metade da memória: data, mensagem e stack trace deixaram de ser cópias e viraram posições dentro do texto original do registro. Um log de 200 MB (2,2 milhões de registros) caiu de 1,6 GB para 0,7 GB na aba.
- O tempo real com milhões de registros ficou quase instantâneo: busca, filtros, contagem por nível e posição das linhas processam só os registros novos. A tela travava 0,87 s a cada linha nova com um filtro ativo; agora trava ~0,05 s. Aplicar uma busca caiu de 0,95 s para 0,4 s.
- Os registros aparecem enquanto o arquivo ainda está sendo lido: com 200 MB, os primeiros surgem em ~0,3 s e o total caiu de ~8 s para ~6 s.
- A visão mesclada de vários arquivos também é incremental: no tempo real, só o fim da linha do tempo é refeito.
- Pacote menor: o app leva só os idiomas pt-BR e en-US do Chromium (47 MB a menos instalado; instalador de 114 para 105 MB).
- A busca procura no registro inteiro, como está no arquivo (data, nível, mensagem, propriedades e stack trace).

**Acesso às pastas**

- Pasta negada não some mais com um erro: aparece um aviso com o botão **Permitir e abrir**, também para as abas restauradas ao abrir o app.
- **Configurações → Pastas liberadas** mostra as pastas que o app pode ler, com a opção de revogar cada uma.

**Qualidade**

- `App.tsx` de 1.579 para 379 linhas: o estado foi para hooks (abas, abertura de pastas, filtros, pipeline de registros, preferências) e a barra de ferramentas, os chips e os avisos viraram componentes.
- `services/platform.ts` é o único ponto que conhece o Electron; o processo principal envia códigos de erro (`[FOLDER_DENIED]`…) e as caixas `alert()` viraram avisos dentro do app.
- Testes novos para o formato compacto dos registros, filtro e mesclagem incrementais, linha do tempo, top erros, filtro por campo e leitura de `.zip`.

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
npm run build:mac  # .dmg (só num Mac)
```

Se `npm run desktop` falhar com `bad option`, o terminal tem a variável `ELECTRON_RUN_AS_NODE` definida (alguns editores a definem): rode `env -u ELECTRON_RUN_AS_NODE npm run desktop` ou apague a variável antes.

Estrutura principal:

| Caminho | O que é |
|---|---|
| `electron/main.cjs` | Processo principal: janela, IPC, controle de acesso às pastas, tempo real e atualização |
| `electron/folderAccess.cjs` | Pastas liberadas e verificação de caminho (testado em `folderAccess.test.ts`) |
| `src/services/logParser.ts` | Parser de formatos e sessão incremental (`LogParseSession`) |
| `src/services/parseWorkerCore.ts` | Lógica do Web Worker: decodificação, `.gz`, parse e acréscimos |
| `src/App.tsx` | Só a composição da tela: o estado fica nos hooks, a interface nos componentes |
| `src/hooks/useLogLoader.ts` | Leitura, parse no worker e tempo real dos arquivos selecionados |
| `src/hooks/useTabs.ts` · `useFolderOpening.ts` | Abas; pastas salvas, sessão anterior, pastas negadas e arquivos abertos pelo sistema |
| `src/hooks/useTabFilters.ts` · `useFilteredEntries.ts` | Estado dos filtros da aba e o pipeline incremental (filtro, período, contagem, linha do tempo) |
| `src/services/platform.ts` | Único ponto que conhece o Electron: `desktop()`, `capabilities` e os códigos de erro do IPC |
| `src/services/logSearch.ts` | Filtros (E/OU, regex, maiúsculas, campos, período, nível, limite) e destaque |
| `src/services/logEntry.ts` | Formato compacto do registro e leitura de data, mensagem e stack trace |
| `src/services/logView.ts` | Filtro e contagem incrementais (só processam os registros novos) |
| `src/services/logMerge.ts` | Mesclagem cronológica de vários arquivos, também incremental |
| `src/services/logFields.ts` · `errorGroups.ts` · `logHistogram.ts` | Filtro por campo, Top erros e linha do tempo |
| `electron/zipReader.cjs` | Leitura de logs dentro de `.zip` (sem dependências) |

## Gerar e publicar uma versão

1. Aumente `version` no `package.json` e descreva as mudanças em **Histórico de versões**, acima.
2. Rode `publicar-atualizacao.bat` e informe um token do GitHub com permissão *Contents: write*.

O instalador e o portátil vão para o GitHub Releases, e quem usa o instalador recebe a atualização automaticamente.
Quando a release é publicada, os workflows [`release-linux.yml`](.github/workflows/release-linux.yml) e [`release-macos.yml`](.github/workflows/release-macos.yml) geram o AppImage, o `.deb` e os `.dmg` (Apple Silicon e Intel) e os anexam à mesma release.
Para gerar os pacotes Linux localmente, rode `npm run build:linux` num Linux (ou no WSL/Docker; no Windows o AppImage não pode ser criado).

### Assinatura de código

O instalador ainda não é assinado, por isso o SmartScreen avisa na primeira execução. Com um certificado de assinatura de código, basta definir `CSC_LINK` (arquivo `.pfx` ou base64) e `CSC_KEY_PASSWORD` antes de rodar o `publicar-atualizacao.bat`: o electron-builder assina o instalador e o portátil sozinho.

## Site de download

A pasta [`site/`](site) é a página estática publicada na Vercel (Root Directory = `site`). Veja [site/README.md](site/README.md).
