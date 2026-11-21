import { useSyncExternalStore } from 'react';
import { matchRoute, normalizePath } from '../seo/site.js';

/* ============================================================
   Minimální router (bez knihovny): cesty v adrese + history API.
   Odkazy <a href="/…"> zachytává globální handler v App.jsx,
   programově navigate('/bazar').
============================================================ */

const isBrowser = typeof window !== 'undefined';
let ssrPath = '/';
export const setSsrPath = (p) => { ssrPath = normalizePath(p); };

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  window.addEventListener('popstate', l);
  return () => { listeners.delete(l); window.removeEventListener('popstate', l); };
};
const getPath = () => normalizePath(window.location.pathname);

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, () => ssrPath);
}

export function scrollToHash(hash, tries = 10) {
  const el = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (tries > 0) setTimeout(() => scrollToHash(hash, tries - 1), 80); // sekce se může ještě dorenderovat
}

/** Přejdi na adresu uvnitř webu. Nová stránka → nahoru, s #kotvou → na sekci. */
export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, window.location.href);
  const target = url.pathname + url.search + url.hash;
  const samePage = normalizePath(url.pathname) === getPath();
  window.history[replace ? 'replaceState' : 'pushState']({ inApp: true }, '', target);
  if (!samePage) emit();
  if (url.hash) requestAnimationFrame(() => scrollToHash(url.hash));
  else if (!samePage) window.scrollTo({ top: 0, behavior: 'instant' });
}

/** Zpět, pokud uživatel přišel z jiné stránky webu; jinak na záložní adresu. */
export function goBackOr(fallback) {
  if (window.history.state?.inApp) window.history.back();
  else navigate(fallback, { replace: true });
}

/** Je odkaz stránka webu (ne soubor, API…)? */
export const isAppPath = (pathname) => matchRoute(pathname).key !== 'notfound';

/** Globální zachycení kliků na interní odkazy (jednou v kořeni aplikace). */
export function installLinkInterceptor() {
  if (!isBrowser) return () => {};
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto|tel):/.test(href)) return; // čisté #kotvy řeší prohlížeč
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin || !isAppPath(url.pathname)) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
