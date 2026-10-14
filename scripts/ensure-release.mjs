// Cria a release da versão atual no GitHub antes do electron-builder enviar os arquivos.
// Sem isso, os envios em paralelo tentam criar a mesma release ao mesmo tempo e um deles falha
// ("Published releases must have a valid tag").
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { owner, repo } = pkg.build.publish[0];
const tag = `v${pkg.version}`;
const token = process.env.GH_TOKEN;

if (!token) {
  console.error('[ensure-release] GH_TOKEN não definido.');
  process.exit(1);
}

const api = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const existing = await fetch(`${api}/releases/tags/${tag}`, { headers });
if (existing.ok) {
  console.log(`[ensure-release] Release ${tag} já existe; os arquivos serão enviados para ela.`);
  process.exit(0);
}
if (existing.status !== 404) {
  console.error(`[ensure-release] Erro ao consultar a release ${tag}: HTTP ${existing.status}`);
  process.exit(1);
}

const created = await fetch(`${api}/releases`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ tag_name: tag, name: pkg.version, target_commitish: 'main' }),
});
if (!created.ok) {
  console.error(`[ensure-release] Não foi possível criar a release ${tag}: HTTP ${created.status} ${await created.text()}`);
  process.exit(1);
}
console.log(`[ensure-release] Release ${tag} criada.`);
