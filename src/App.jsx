import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext.jsx';
import SiteLanding from './components/SiteLanding.jsx'; // veřejný web = první obrazovka → eager (LCP)
import TelegramJoin from './components/TelegramJoin.jsx';
import ActivationError from './components/ActivationError.jsx';
import { installLinkInterceptor, navigate, usePath } from './lib/router.js';
import { PAGES, NOT_FOUND, SITE_URL, matchRoute } from './seo/site.js';

// Nekritické části → lazy chunky, načtou se až při interakci (mimo initial bundle)
const Dashboard = lazy(() => import('./components/Dashboard.jsx'));
const Checkout = lazy(() => import('./components/Checkout.jsx'));
const AuthModal = lazy(() => import('./components/AuthModal.jsx'));

/** Při přechodu mezi stránkami v prohlížeči přepiš title, popis a canonical
 *  (HTML ze serveru je má správně už od prerenderu; detail auta si je nastaví sám). */
function setHead(path) {
  const route = matchRoute(path);
  if (route.key === '/auto') return;
  const meta = PAGES[route.key] || NOT_FOUND;
  document.title = meta.title;
  const set = (sel, attr, val) => document.head.querySelector(sel)?.setAttribute(attr, val);
  set('meta[name="description"]', 'content', meta.description);
  set('meta[property="og:title"]', 'content', meta.title);
  set('meta[property="og:description"]', 'content', meta.description);
  set('link[rel="canonical"]', 'href', `${SITE_URL}${route.path}`);
  set('meta[property="og:url"]', 'content', `${SITE_URL}${route.path}`);
}

/**
 * Kořen aplikace: přepíná veřejný web ↔ klientskou administraci,
 * drží nad vším pokladnu a zpracuje návrat z platby (Stripe).
 */
function Root() {
  const { view, checkout, authOpen, handleCheckoutReturn, hasAccess, membershipLoaded, backToSite, startDefaultCheckout } = useApp();
  const locked = view === 'dashboard' && (!membershipLoaded || !hasAccess);
  const path = usePath();

  // Interní odkazy <a href="/…"> → bez reloadu stránky
  useEffect(() => installLinkInterceptor(), []);
  useEffect(() => { setHead(path); }, [path]);
  // Staré odkazy na formulář (#nacenit-auto) → vlastní stránka
  useEffect(() => {
    if (window.location.hash === '#nacenit-auto') navigate('/prodej-auta/formular', { replace: true });
  }, []);

  // Klientská zóna jen se zaplaceným členstvím (nebo jako admin). Když přístup
  // zmizí (zrušené/neuhrazené předplatné, odhlášení), vrať na web a nabídni platbu.
  useEffect(() => {
    if (view === 'dashboard' && membershipLoaded && !hasAccess) { backToSite(); startDefaultCheckout(); }
  }, [view, membershipLoaded, hasAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Návrat ze Stripe Checkout: ?checkout=success&session_id=… → ověř platbu.
  // Vypršela-li mezitím session, handleCheckoutReturn otevře přihlášení
  // a členství dokončí po něm.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (!status) return;
    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname);
    if (status === 'success') {
      handleCheckoutReturn(params.get('session_id')).finally(cleanUrl);
    } else {
      cleanUrl();
    }
  }, [handleCheckoutReturn]);

  return (
    <div className="grain">
      {locked ? (
        <FullLoader />
      ) : view === 'dashboard' ? (
        <Suspense fallback={<FullLoader />}>
          <Dashboard />
        </Suspense>
      ) : (
        <SiteLanding />
      )}

      {/* Pokladna + přihlášení se stáhnou až když je uživatel otevře */}
      {checkout && <Suspense fallback={null}><Checkout /></Suspense>}
      {authOpen && <Suspense fallback={null}><AuthModal /></Suspense>}
      <TelegramJoin />
      <ActivationError />
    </div>
  );
}

/** Jednoduchý fallback při načítání administrace */
function FullLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
