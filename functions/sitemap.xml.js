import { PAGES, SITE_URL, carPath } from '../src/seo/site.js';

/** Cloudflare Pages Function: /sitemap.xml — statické stránky + všechna auta (živě z DB). */
export async function onRequestGet({ env }) {
  const urls = Object.entries(PAGES).map(([path, p]) => ({ loc: `${SITE_URL}${path === '/' ? '/' : path}`, priority: p.priority, changefreq: p.changefreq }));
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/cars?select=id,brand,model,year,status&status=neq.draft&order=created_at.desc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      for (const r of await res.json()) {
        urls.push({ loc: `${SITE_URL}${carPath(r)}`, priority: r.status === 'sold' ? '0.4' : '0.8', changefreq: r.status === 'sold' ? 'monthly' : 'weekly' });
      }
    }
  } catch (e) {
    console.error('sitemap cars', e); // bez aut je sitemap pořád platná
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
