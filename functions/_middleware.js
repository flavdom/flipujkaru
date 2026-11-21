/**
 * flipujkaru.cz → https://www.flipujkaru.cz (301), ať Google nevidí dva weby se stejným obsahem.
 * Statické soubory (/assets, ikony…) middleware vůbec nevolají — viz public/_routes.json.
 * /api/* se nepřesměrovává (Stripe webhook a POSTy redirect nesledují).
 * Až bude v Cloudflare nastavené Redirect Rule (Rules → Redirect Rules), dá se tenhle soubor smazat.
 */
const APEX = 'flipujkaru.cz';
const WWW = 'www.flipujkaru.cz';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === APEX && (request.method === 'GET' || request.method === 'HEAD') && !url.pathname.startsWith('/api/')) {
    url.hostname = WWW;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
