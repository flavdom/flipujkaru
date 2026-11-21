/* ============================================================
   Prerender (SSG): po `vite build` (klient) a `vite build --ssr` vyrenderuje
   každou stránku do hotového HTML → dist/<stránka>.html (+ dist/404.html).
   Cloudflare Pages servíruje /bazar z dist/bazar.html; neznámé cesty → 404.html
   se stavem 404 (SPA fallback v _redirects už není).

   Texty webu a auta se při buildu načtou ze Supabase (veřejný anon klíč) a
   zapečou do HTML + window.__INITIAL__. Po změně textů/aut se HTML pro roboty
   obnoví dalším buildem; lidé vidí čerstvá data vždy (načtou se po startu).
   Detail auta (/auto/…) se renderuje živě funkcí functions/auto/[slug].js.
============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const env = loadEnv('production', root, '');

const { render } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href);
const { PAGES } = await import(pathToFileURL(resolve(root, 'src/seo/site.js')).href);

async function fetchRows(table, query) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const contentRows = await fetchRows('content', 'select=key,value');
const siteText = Object.fromEntries((contentRows || []).map((r) => [r.key, r.value]));
const cars = await fetchRows('cars', 'select=*&status=neq.draft&order=sort.asc,created_at.desc');
console.log(`prerender: ${Object.keys(siteText).length} textů, ${cars?.length ?? 0} aut`);

const template = readFileSync(resolve(dist, 'index.html'), 'utf8');
for (const marker of ['<!--head-->', '<!--/head-->', '<!--data-->', '<!--app-->']) {
  if (!template.includes(marker)) throw new Error(`index.html: chybí značka ${marker}`);
}

const WITH_CARS = new Set(['/', '/bazar', '/nase-flipy']);
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function page(path) {
  const data = { siteText, ...(WITH_CARS.has(path) && cars ? { cars } : {}) };
  const { html, head } = render(path, data);
  return template
    // funkce jako náhrada → „$" v textu se nebere jako vzor
    .replace(/<!--head-->[\s\S]*<!--\/head-->/, () => `<!--head-->\n    ${head}\n    <!--/head-->`)
    .replace('<!--data-->', () => `<script>window.__INITIAL__=${json(data)}</script>`)
    .replace('<!--app-->', () => html);
}

const out = (rel, html) => {
  const file = resolve(dist, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

for (const path of Object.keys(PAGES)) {
  out(path === '/' ? 'index.html' : `${path.slice(1)}.html`, page(path));
}
out('404.html', page('/stranka-neexistuje'));
rmSync(resolve(root, 'dist-ssr'), { recursive: true, force: true });
console.log(`prerender: ${Object.keys(PAGES).length} stránek + 404.html`);
