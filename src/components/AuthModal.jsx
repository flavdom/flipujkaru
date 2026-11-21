import { useEffect, useState } from 'react';
import { X, Mail, Lock, User, Loader2, AlertCircle, CheckCircle2, ArrowRight, PartyPopper, Send } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import { LogoMark } from './Logo.jsx';
import { telegramLink } from '../lib/telegram.js';

/** Přihlášení / registrace / reset hesla (e-mail + heslo přes Supabase). */
export default function AuthModal() {
  const { authOpen, closeAuth, signIn, signUp, resetPassword, resendConfirmation, updatePassword, recoveryMode, afterAuth, pendingStripeSession, pendingPlan } = useApp();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(''); // e-mail čekající na potvrzení → nabídni „poslat znovu"

  // Zaplaceno, ale vypršela session → přihlášení e-mailem z platby.
  // Rozdělaná objednávka bez účtu → rovnou registrace.
  useEffect(() => {
    if (!authOpen) return;
    setUnconfirmed('');
    if (recoveryMode) {
      setMode('newpass'); setError(''); setInfo('');
    } else if (pendingStripeSession) {
      setMode('login');
      setForm((f) => ({ ...f, email: pendingStripeSession.email || f.email }));
    } else if (pendingPlan) {
      setMode('register');
    }
  }, [authOpen, pendingStripeSession, pendingPlan, recoveryMode]);

  if (!authOpen) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); setUnconfirmed(''); };

  const resend = async () => {
    setBusy(true); setError('');
    try {
      await resendConfirmation(unconfirmed);
      setInfo(`Ověřovací e-mail jsme poslali znovu na ${unconfirmed}. Mrkni i do spamu.`);
    } catch (err) {
      setError(translate(err.message));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setInfo(''); setUnconfirmed('');
    try {
      if (mode === 'login') {
        await signIn(form.email, form.password);
        afterAuth();
      } else if (mode === 'register') {
        const { session } = await signUp(form.email, form.password, form.name);
        if (session) afterAuth(); // potvrzení e-mailu je vypnuté → rovnou přihlášen
        else {
          setUnconfirmed(form.email);
          setInfo(pendingPlan
            ? `Skoro hotovo! Poslali jsme ti ověřovací e-mail na ${form.email}. Klikni na odkaz v něm a vrátíme tě rovnou k platbě.`
            : `Hotovo! Poslali jsme ti ověřovací e-mail na ${form.email} — klikni na odkaz a jsi přihlášen(a).`);
        }
      } else if (mode === 'newpass') {
        await updatePassword(form.password);
        setInfo('Heslo je změněné. Jsi přihlášen(a).');
        setTimeout(() => closeAuth(), 1500);
      } else {
        await resetPassword(form.email);
        setInfo('Poslali jsme ti e-mail s odkazem na obnovu hesla.');
      }
    } catch (err) {
      if (/Email not confirmed/i.test(err.message || '')) setUnconfirmed(form.email);
      setError(translate(err.message));
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    login: { h: 'Přihlášení', sub: 'Vítej zpět. Pokračuj do svého účtu.' },
    register: { h: 'Vytvořit účet', sub: 'Pár vteřin a jsi součástí komunity.' },
    reset: { h: 'Obnova hesla', sub: 'Zadej e-mail a pošleme ti odkaz.' },
    newpass: { h: 'Nové heslo', sub: 'Zvol si nové heslo ke svému účtu.' },
  }[mode];

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={closeAuth}
      role="dialog"
      aria-modal="true"
      aria-label="Přihlášení"
    >
      <div className="animate-fade-up w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-ink-850"><LogoMark className="h-6 w-6" /></span>
            <div>
              <div className="font-display font-bold text-white">{titles.h}</div>
              <div className="text-xs text-zinc-500">{titles.sub}</div>
            </div>
          </div>
          <button onClick={closeAuth} aria-label="Zavřít" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 p-6">
          {pendingStripeSession && (
            <div className="rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent">
              <p className="flex items-start gap-2">
                <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" /> Platba proběhla! Přihlas se svým účtem a hned ti aktivujeme členství.
              </p>
              {/* Vstup do Telegram skupiny tady, ne v plovoucí liště — ta by na mobilu zakryla formulář */}
              <a href={telegramLink(pendingStripeSession.sessionId)} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-ink-950 shadow-glow transition hover:brightness-110">
                <Send className="h-4 w-4" /> Otevřít Telegram a vstoupit do skupiny členů
              </a>
            </div>
          )}
          {mode === 'register' && (
            <Field icon={User} label="Jméno" value={form.name} onChange={set('name')} placeholder="Jan Novák" autoComplete="name" required />
          )}
          {mode !== 'newpass' && (
            <Field icon={Mail} label="E-mail" type="email" value={form.email} onChange={set('email')} placeholder="tvuj@email.cz" autoComplete="email" required readOnly={!!pendingStripeSession} />
          )}
          {pendingStripeSession && (
            <p className="-mt-1 text-xs text-zinc-500">Členství aktivujeme k účtu, ze kterého jsi platil(a).</p>
          )}
          {!pendingStripeSession && pendingPlan && mode === 'register' && !info && (
            <p className="rounded-xl border border-white/10 bg-ink-850 p-3 text-xs text-zinc-400">
              Před platbou si založ účet — pošleme ti e-mail s odkazem na ověření adresy. Po potvrzení pokračuješ rovnou k platbě.
            </p>
          )}
          {mode !== 'reset' && (
            <Field icon={Lock} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} label={mode === 'newpass' ? 'Nové heslo' : 'Heslo'} required minLength={6} />
          )}

          {error && <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
          {info && <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {info}</p>}
          {unconfirmed && (
            <button type="button" onClick={resend} disabled={busy} className="w-full text-center text-sm font-medium text-zinc-400 transition hover:text-white disabled:opacity-50">
              E-mail nedorazil? <span className="text-accent hover:underline">Poslat ověření znovu</span>
            </button>
          )}

          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 font-semibold text-ink-950 shadow-glow transition enabled:hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{mode === 'login' ? 'Přihlásit se' : mode === 'register' ? 'Vytvořit účet' : mode === 'newpass' ? 'Uložit heslo' : 'Poslat odkaz'} <ArrowRight className="h-4 w-4" /></>}
          </button>

          {/* Přepínání režimů */}
          <div className="pt-1 text-center text-sm text-zinc-400">
            {mode === 'login' && (
              <>
                <button type="button" onClick={() => switchMode('reset')} className="text-zinc-400 hover:text-white">Zapomenuté heslo?</button>
                <div className="mt-2">Nemáš účet? <button type="button" onClick={() => switchMode('register')} className="font-semibold text-accent hover:underline">Zaregistruj se</button></div>
              </>
            )}
            {mode === 'register' && (
              <div>Už máš účet? <button type="button" onClick={() => switchMode('login')} className="font-semibold text-accent hover:underline">Přihlas se</button></div>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => switchMode('login')} className="font-semibold text-accent hover:underline">Zpět na přihlášení</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Přeloží nejčastější chyby Supabase do češtiny */
function translate(msg = '') {
  if (/Invalid login credentials/i.test(msg)) return 'Špatný e-mail nebo heslo.';
  if (/already registered|already exists/i.test(msg)) return 'Tento e-mail už je registrovaný. Přihlas se.';
  if (/Email not confirmed/i.test(msg)) return 'Nejdřív potvrď e-mail (klikni na odkaz v e-mailu).';
  if (/security purposes|rate limit|after \d+ seconds/i.test(msg)) return 'Moc pokusů za sebou — zkus to prosím za minutu.';
  if (/Password should be at least/i.test(msg)) return 'Heslo musí mít aspoň 6 znaků.';
  if (/not configured/i.test(msg)) return 'Účty zatím nejsou nastavené (chybí klíče Supabase).';
  return msg;
}

function Field({ icon: Icon, label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input {...props} className="w-full rounded-xl border border-white/10 bg-ink-950 py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
      </div>
    </label>
  );
}
