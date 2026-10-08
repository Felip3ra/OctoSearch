# Site de download do OctoSearch

Página estática (HTML + CSS, sem build) pronta para a Vercel.

## 1. Hospede o instalador (GitHub Releases)

O instalador tem ~113 MB e a Vercel não aceita arquivos acima de 100 MB, então ele fica no GitHub:

1. Crie um repositório **público** no GitHub chamado `OctoSearch`.
2. O usuário/repositório (`Felip3ra/OctoSearch`) já está configurado em `config.js` (site) e em `build.publish` no `package.json` (app).
3. Crie um token em GitHub → Settings → Developer settings → Personal access tokens (permissão *Contents: write* no repositório).
4. Rode `publicar-atualizacao.bat` na raiz do projeto: ele gera o instalador e o portátil e cria a release com o `latest.yml` usado pela atualização automática.

## 2. Site na Vercel

O projeto `octosearch` na Vercel está ligado ao repositório `Felip3ra/OctoSearch` com
**Root Directory = `site`** e Framework Preset = **Other** (sem build).
Todo `git push` na branch `main` publica o site automaticamente em https://octosearch-omega.vercel.app.

> Se a Root Directory voltar para a raiz, a Vercel passa a publicar a versão web do app
> no lugar da landing page — confira em Settings → Build and Deployment.

## Nova versão (atualização automática)

1. Aumente `version` no `package.json` (ex.: `1.0.0` → `1.0.1`).
2. Rode `publicar-atualizacao.bat`.

Quem usa o **instalador** recebe a atualização ao abrir o app (download em segundo plano + aviso para reiniciar).
O **portátil** não se atualiza sozinho. Os links do site sempre apontam para a última release; só atualize
`version`/`sizeLabel` em `config.js` se quiser mostrar o número novo.
