import { carSlug, carMeta, carLd, organizationLd, headTags, carPath } from '../../src/seo/site.js';
import { carArticleHtml } from '../../src/seo/carHtml.js';

/**
 * Cloudflare Pages Function: detail auta /auto/:slug (živě z DB → nová auta bez rebuildu).
 * Vezme prerenderovaný bazar (dist/bazar.html) a doplní title, popis, canonical,
 * Open Graph s fotkou auta, JSON-LD Car + Offer a HTML detailu pro roboty.
 * Smazané / neznámé auto → skutečná 404. Přejmenované auto → 301 na nový slug.
 */
const ID_LEN = 6;

async function db(env, query) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/cars?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`cars: HTTP ${res.status}`);
  return res.json();
}

const notFound = async (env, request) => {
  const res = await env.ASSETS.fetch(new URL('/__neexistuje', request.url));
  return new Response(res.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
};

export async function onRequestGet({ request, env, params }) {
  const slug = String(params.slug || '').toLowerCase();
  const idPrefix = slug.slice(-ID_LEN);
  if (!/^[a-z0-9-]+$/.test(slug) || !/^[0-9a-f]{6}$/.test(idPrefix)) return notFound(env, request);

  let row;
  try {
    // Jen ne-koncepty; shoda podle kousku ID na konci adresy
    const light = await db(env, 'select=id,brand,model,year,status&status=neq.draft');
    const hit = light.find((r) => String(r.id).replace(/-/g, '').startsWith(idPrefix));
    if (!hit) return notFound(env, request);
    if (carSlug(hit) !== slug) return Response.redirect(new URL(carPath(hit), request.url).toString(), 301);
    [row] = await db(env, `select=*&id=eq.${hit.id}`);
  } catch (e) {
    console.error('auto detail', e);
    return new Response('Dočasná chyba, zkus to prosím za chvíli.', { status: 503, headers: { 'retry-after': '30' } });
  }
  if (!row) return notFound(env, request);

  const meta = carMeta(row);
  const head = headTags({
    title: meta.title,
    description: meta.description,
    path: carPath(row),
    image: meta.image,
    type: 'product',
    ld: [organizationLd(), carLd(row)],
  });

  const shell = await (await env.ASSETS.fetch(new URL('/bazar', request.url))).text();
  const html = shell
    .replace(/<!--head-->[\s\S]*<!--\/head-->/, () => `<!--head-->\n    ${head}\n    <!--/head-->`)
    .replace('<h1 class="sr-only">Bazar prověřených aut</h1>', '') // jediný h1 = název auta
    .replace('<div id="root">', () => `<div id="root">${carArticleHtml(row)}`);

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
