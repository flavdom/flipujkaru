import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { initialData } from './lib/initialData.js';
import { supabase, SUPABASE_READY } from './lib/supabase.js';
import { PLANS } from './data/content.js';
import { DEFAULT_BILLING, billingById } from './config/billing.js';
import { savePaidSession, getPaidSession } from './lib/telegram.js';

/* Sdílený stav aplikace: účty (Supabase), přepínání web ↔ administrace, checkout. */
const AppContext = createContext(null);

// Rozdělaná objednávka čekající na potvrzení e-mailu. Uživatel se zaregistruje,
// odejde do schránky a vrátí se odkazem (klidně v nové záložce) → přes
// localStorage ho po přihlášení pustíme rovnou zpět do pokladny.
const PENDING_CHECKOUT_KEY = 'fk_pending_checkout';
const PENDING_CHECKOUT_TTL = 1000 * 60 * 60 * 48; // 48 h
function savePendingCheckout(c) {
  try { localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ planName: c.plan?.name, billing: c.billing?.id, at: Date.now() })); } catch { /* bez localStorage nevadí */ }
}
function takePendingCheckout() {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    localStorage.removeItem(PENDING_CHECKOUT_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || Date.now() - (p.at || 0) > PENDING_CHECKOUT_TTL) return null;
    const plan = PLANS.find((x) => x.name === p.planName) || PLANS[0];
    return { plan, billing: billingById(p.billing) };
  } catch { return null; }
}

export function AppProvider({ children }) {
  const [view, setView] = useState('site'); // 'site' | 'dashboard'
  const [dashTab, setDashTab] = useState(null); // záložka, na které se má administrace otevřít
  // Návrat ze zákaznického portálu Stripe (?ucet=faktury) → po přihlášení otevři administraci
  const accountReturn = useRef(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ucet') : null);
  const [checkout, setCheckout] = useState(null); // { plan, billing } | null
  const [member, setMember] = useState(null); // členství (Fáze C napojí na Stripe)
  const [user, setUser] = useState(null); // přihlášený uživatel (Supabase)
  const [isAdmin, setIsAdmin] = useState(false); // má účet roli admin?
  const [membershipLoaded, setMembershipLoaded] = useState(!SUPABASE_READY); // členství přihlášeného účtu už načtené?
  const [activationError, setActivationError] = useState(null); // sessionId zaplacené platby, jejíž aktivace selhala
  const [siteText, setSiteText] = useState(() => initialData().siteText || {}); // editovatelné texty webu (z DB; start ze zapečených při prerenderu)
  const [authOpen, setAuthOpen] = useState(false); // okno přihlášení/registrace
  const [recoveryMode, setRecoveryMode] = useState(false); // přišel z odkazu na obnovu hesla → nastav nové heslo
  const [pendingPlan, setPendingPlan] = useState(null); // plán, který chtěl koupit před přihlášením
  const [pendingStripeSession, setPendingStripeSession] = useState(null); // { sessionId, email } — zaplaceno, čeká se na přihlášení
  const [justPaidSession, setJustPaidSession] = useState(null); // právě zaplacená Checkout Session → tlačítko „Otevřít Telegram"
  const [telegramSession, setTelegramSession] = useState(getPaidSession); // Checkout Session pro „Propojit Telegram" v kabinetu
  const [telegramLinked, setTelegramLinked] = useState(false); // bot nahlásil vstup do skupiny (telegram_links)

  // Načte členství uživatele z databáze (profiles). Jeden retry po krátké
  // prodlevě při chybě (přechodná síťová/RLS timing chyba), než se vzdá.
  // Vrací, jestli má účet přístup do klientské zóny (aktivní členství / admin).
  const loadMembership = async (u, retry = true) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status, current_period_end, role')
        .eq('id', u.id)
        .single();
      if (error) throw error;
      setIsAdmin(data?.role === 'admin');
      // Session ID poslední platby (pro Telegram) — zvlášť a best-effort, ať
      // chybějící sloupec (nespuštěná migrace) nerozbije načtení členství.
      supabase.from('profiles').select('stripe_checkout_session_id').eq('id', u.id).single()
        .then(({ data: d }) => { if (d?.stripe_checkout_session_id) setTelegramSession(d.stripe_checkout_session_id); });
      const plan = data?.plan && data.subscription_status === 'active' ? PLANS.find((p) => p.name === data.plan) : null;
      setMember(plan ? { plan, email: u.email, renews: data.current_period_end } : null);
      return !!plan || data?.role === 'admin';
    } catch {
      if (retry) {
        await new Promise((r) => setTimeout(r, 800));
        return loadMembership(u, false);
      }
      setMember(null);
      setIsAdmin(false);
      return false;
    }
  };

  // Načte editovatelné texty webu (veřejné — i pro nepřihlášené)
  const reloadContent = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('content').select('key, value');
    if (data) setSiteText(Object.fromEntries(data.map((r) => [r.key, r.value])));
  };
  useEffect(() => { reloadContent(); }, []);

  // Sledování přihlášení + načtení členství. Spoléháme jen na
  // onAuthStateChange — supabase-js v2 při odběru sám vystřelí počáteční
  // INITIAL_SESSION event, takže samostatné getSession() by běželo souběžně
  // a spouštělo dva paralelní loadMembership() běhy bez pořadí/cancelace.
  useEffect(() => {
    if (!SUPABASE_READY) return;
    let loadedFor = null; // účet, jehož členství už je načtené
    const apply = async (session) => {
      const u = session?.user ?? null;
      setUser(u);
      // Obnova tokenu / změna jména (TOKEN_REFRESHED, USER_UPDATED) u téhož účtu
      // nemění členství — znovunačtení by na chvíli zamklo administraci a ta by
      // se znovu otevřela na Přehledu (rozdělaná práce v záložce by zmizela).
      if (u && u.id === loadedFor) return;
      loadedFor = u?.id ?? null;
      if (u) {
        setMembershipLoaded(false);
        const access = await loadMembership(u);
        // Návrat z ověřovacího odkazu → pokračuj v rozdělané objednávce.
        if (u.email_confirmed_at) {
          const pending = takePendingCheckout();
          if (pending && !access) { setAuthOpen(false); setPendingPlan(null); setCheckout(pending); }
        }
      } else { setMember(null); setIsAdmin(false); }
      setMembershipLoaded(true);
    };
    // Callback NESMÍ čekat na další Supabase dotaz: supabase-js ho volá pod
    // auth zámkem a await na dotaz (ten si bere session = stejný zámek) zámek
    // zablokuje navždy — po obnově tokenu (návrat na tab, expirace) pak visí
    // VŠECHNY dotazy (Moje flipy, Žebříčky, role admina…). Proto odložit.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Odkaz z e-mailu „Obnova hesla" → otevři formulář pro nové heslo
      if (event === 'PASSWORD_RECOVERY') { setRecoveryMode(true); setAuthOpen(true); }
      setTimeout(() => apply(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Vstoupil už člen do Telegram skupiny? Zapisuje bot přes /api/telegram-linked;
  // RLS pustí jen záznam k platbě přihlášeného účtu. Best-effort (bez tabulky = false).
  useEffect(() => {
    if (!user || !telegramSession) { setTelegramLinked(false); return; }
    supabase.from('telegram_links').select('session_id').eq('session_id', telegramSession).maybeSingle()
      .then(({ data }) => setTelegramLinked(!!data));
  }, [user, telegramSession]);

  // Poté, co je uživatel přihlášen (nově vytvořený nebo existující účet):
  // ověř platbu u backendu a zapiš členství k účtu, pak otevři administraci.
  const activateAfterCheckout = async (sessionId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nepřihlášeno.');
      const res = await fetch('/api/activate-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Aktivace selhala.');
      await loadMembership(session.user);
      setActivationError(null);
      localStorage.removeItem('fk_pending');
      setView('dashboard');
      window.scrollTo(0, 0);
    } catch {
      // Žádné členství „na důvěru" z prohlížeče — přístup dává jen ověřená platba.
      // Uživatel zůstane na webu s výzvou zkusit aktivaci znovu (ActivationError).
      setActivationError(sessionId);
    }
  };

  // Návrat ze Stripe (?checkout=success). Platit jde jen přihlášeným účtem
  // s ověřeným e-mailem, takže účet vždy existuje — jen mohla vypršet session
  // (jiný prohlížeč, smazané cookies) → otevřeme přihlášení a aktivaci
  // dokončíme po něm (viz afterAuth). Platbu ověřujeme veřejným endpointem.
  const handleCheckoutReturn = async (sessionId) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (!data.paid) return;
      setJustPaidSession(sessionId);
      setTelegramSession(sessionId);
      savePaidSession(sessionId);
      const { data: { session } } = SUPABASE_READY ? await supabase.auth.getSession() : { data: { session: null } };
      if (session) {
        await activateAfterCheckout(sessionId);
      } else {
        setPendingStripeSession({ sessionId, email: data.email || '' });
        setAuthOpen(true);
      }
    } catch {
      // Backend nedostupný — uživatel se může přihlásit ručně přes navbar.
    }
  };

  // ---- Auth akce ----
  const signUp = async (email, password, fullName) => {
    if (!supabase) throw new Error('Supabase není nakonfigurované.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    // session=null → je potřeba potvrdit e-mail. Rozdělanou objednávku si
    // zapamatujeme, ať se po kliknutí na odkaz vrátí rovnou do pokladny.
    if (!data.session && pendingPlan) savePendingCheckout(pendingPlan);
    return { session: data.session };
  };

  // Znovu poslat ověřovací e-mail (nedorazil, propadl odkaz…).
  const resendConfirmation = async (email) => {
    if (!supabase) throw new Error('Supabase není nakonfigurované.');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
  };

  const signIn = async (email, password) => {
    if (!supabase) throw new Error('Supabase není nakonfigurované.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const resetPassword = async (email) => {
    if (!supabase) throw new Error('Supabase není nakonfigurované.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  };

  // Nové heslo po kliknutí na odkaz z e-mailu (uživatel je už přihlášený recovery session)
  const updatePassword = async (password) => {
    if (!supabase) throw new Error('Supabase není nakonfigurované.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  };

  const signOut = async () => {
    // Vyčisti stav hned — ať tlačítko vždy reaguje, i kdyby volání Supabase
    // selhalo nebo se zaseklo (známý deadlock na auth zámku v prohlížeči).
    setUser(null);
    setMember(null);
    setIsAdmin(false);
    setView('site');
    window.scrollTo(0, 0);
    try {
      // scope: 'local' = odhlásí jen tento prohlížeč a nečeká na síťové ověření,
      // takže odhlášení projde i s expirovaným tokenem / bez připojení.
      await supabase?.auth.signOut({ scope: 'local' });
    } catch {
      // Ignorujeme (např. chybějící/expirovaná session) — stav už je vyčištěný.
    }
    // Pojistka: odstraň uložený token, ať se po reloadu nikdo nepřihlásí zpět.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* localStorage nemusí být dostupné (privátní režim) */ }
  };

  // ---- Přihlašovací okno ----
  const openAuth = (plan = null) => { setPendingPlan(plan); setAuthOpen(true); };
  const closeAuth = () => { setAuthOpen(false); setPendingPlan(null); setRecoveryMode(false); };

  // Po úspěšném přihlášení/registraci: dokonči zaplacenou platbu (vypršela
  // session), jinak měl rozdělaný nákup → checkout, jinak → administrace.
  const afterAuth = async () => {
    setAuthOpen(false);
    try { localStorage.removeItem(PENDING_CHECKOUT_KEY); } catch { /* nevadí */ }
    if (pendingStripeSession) {
      const { sessionId } = pendingStripeSession;
      setPendingStripeSession(null);
      await activateAfterCheckout(sessionId);
      return;
    }
    if (pendingPlan) { setCheckout(pendingPlan); setPendingPlan(null); }
    else await openDashboard(); // bez zaplaceného členství → rovnou na platbu
  };

  // ---- Checkout ----
  // Nejdřív účet s ověřeným e-mailem, až pak platba. Nepřihlášený → registrace
  // (po ní a potvrzení e-mailu se pokladna otevře sama, viz signUp/apply).
  const startCheckout = (plan, billing = DEFAULT_BILLING) => {
    if (SUPABASE_READY && !user) { openAuth({ plan, billing }); return; }
    setCheckout({ plan, billing });
  };
  const closeCheckout = () => setCheckout(null);

  const completePurchase = ({ email, plan }) => {
    setMember({ email, plan });
    setCheckout(null);
    setView('dashboard');
    window.scrollTo(0, 0);
  };

  // Do klientské zóny jen s aktivním (zaplaceným) členstvím, nebo jako admin.
  const hasAccess = !!member || isAdmin;
  const startDefaultCheckout = () => startCheckout(PLANS[0], DEFAULT_BILLING);
  // Nečlen se přihlásil/registroval → nemá už zaplaceno? (starší pay-first platby, zavřená
  // záložka před založením účtu). Nejdřív platba uložená v tomto prohlížeči
  // (ověřitelná session), pak dohledání aktivního předplatného podle e-mailu.
  const claimMembership = async (session) => {
    const call = async (body) => {
      try {
        const res = await fetch('/api/activate-membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch { return {}; }
    };
    const stored = getPaidSession();
    let data = stored ? await call({ sessionId: stored }) : {};
    if (!data.ok) data = await call({});
    if (!data.ok) return false;
    if (data.sessionId) { setTelegramSession(data.sessionId); savePaidSession(data.sessionId); }
    return loadMembership(session.user);
  };

  // Rozhoduje až nad čerstvě načteným členstvím — stav z onAuthStateChange
  // se po přihlášení doplňuje se zpožděním a zaplacený člen by jinak skončil v pokladně.
  const openDashboard = async () => {
    const { data: { session } } = SUPABASE_READY ? await supabase.auth.getSession() : { data: { session: null } };
    const access = session ? (await loadMembership(session.user)) || (await claimMembership(session)) : false;
    if (!access) {
      if (session) setCheckout({ plan: PLANS[0], billing: DEFAULT_BILLING }); // `user` stav se může ještě doplňovat
      else startDefaultCheckout();
      return;
    }
    setView('dashboard'); window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!accountReturn.current) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('ucet');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);
  useEffect(() => {
    if (!accountReturn.current || !membershipLoaded || !user) return;
    setDashTab(accountReturn.current);
    accountReturn.current = null;
    openDashboard();
  }, [membershipLoaded, user]);

  const backToSite = () => { setView('site'); window.scrollTo(0, 0); };

  return (
    <AppContext.Provider
      value={{
        view, checkout, member, user, isAdmin, authOpen, siteText, reloadContent,
        startCheckout, closeCheckout, completePurchase, activateAfterCheckout, handleCheckoutReturn,
        pendingStripeSession, justPaidSession, telegramSession, telegramLinked, dismissJustPaid: () => setJustPaidSession(null),
        openDashboard, backToSite, dashTab, hasAccess, membershipLoaded, startDefaultCheckout, activationError,
        signUp, signIn, signOut, resetPassword, resendConfirmation, updatePassword, recoveryMode,
        openAuth, closeAuth, afterAuth, pendingPlan,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
