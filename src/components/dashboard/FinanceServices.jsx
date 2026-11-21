import { useEffect, useState } from 'react';
import {
  Plus, X, Loader2, ShieldCheck, Banknote, FileText, RefreshCw, AlertCircle, CheckCircle2, Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useApp } from '../../AppContext.jsx';
import { BILLING_OPTIONS } from '../../config/billing.js';
import {
  SERVICES, serviceByKey, serviceRate, estimateCashback, MEMBER_STATUS, CLOSED_STATUSES, OPEN_STATUSES,
  DEFAULT_DISCLAIMER, fmtCzk,
} from '../../config/finance.js';

const ICONS = { ShieldCheck, Banknote, FileText, RefreshCw };
const YEARLY_PRICE = (BILLING_OPTIONS.find((o) => o.id === 'yearly') || BILLING_OPTIONS[0]).price;

const STEPS = [
  { title: 'Předáš kontakt', text: 'Jméno a telefon klienta, který s předáním souhlasí. Nic víc neřešíš.' },
  { title: 'Specialista se ozve do 24 h', text: 'Licencovaný zprostředkovatel připraví nabídku a vše s klientem vyřídí.' },
  { title: 'Dostaneš cashback', text: 'Po podpisu smlouvy a výplatě provize partnerem ti ho připíšeme na účet.' },
];

/** Klientská zóna → Finanční služby: cashback za doporučení klienta. */
export default function FinanceServices() {
  const { siteText } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [preset, setPreset] = useState('insurance');

  const load = async () => {
    const { data, error: err } = await supabase.from('referrals').select('*').order('created_at', { ascending: false });
    if (err) setError('Doporučení se nepodařilo načíst.');
    else { setList(data || []); setError(''); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openForm = (service = 'insurance') => { setPreset(service); setFormOpen(true); };

  const paid = list.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.cashback_czk || 0), 0);
  const waiting = list.filter((r) => r.status === 'cashback_offered').reduce((s, r) => s + Number(r.cashback_czk || 0), 0);
  const inProgress = list.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const closed = list.filter((r) => CLOSED_STATUSES.includes(r.status)).length;
  const ratio = paid / YEARLY_PRICE;
  const disclaimer = [siteText.fin_intermediary, siteText.fin_disclaimer || DEFAULT_DISCLAIMER].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      {/* Hlavička */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">Finanční služby pro členy</span>
          <h1 className="mt-1 font-display text-2xl font-bold text-white md:text-3xl">Prodáváš auto? Vydělej i na pojištění a financování.</h1>
          <p className="mt-2 text-sm text-zinc-400">Předej nám kontakt na klienta, náš specialista vyřeší pojištění nebo financování a ty dostaneš cashback z každé uzavřené smlouvy.</p>
        </div>
        <button onClick={() => openForm()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:brightness-110">
          <Plus className="h-4 w-4" /> Doporučit klienta
        </button>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vyplaceno celkem" value={fmtCzk(paid)} />
        <Stat label="Čeká na výplatu" value={fmtCzk(waiting)} accent />
        <Stat label="Doporučení v řešení" value={inProgress} />
        <Stat label="Uzavřené smlouvy" value={`${closed} z ${list.length}`} />
      </div>

      {/* Návratnost členství */}
      <div className="rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/[0.07] to-transparent p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Návratnost členství</span>
        <div className="mt-1 font-display text-lg font-bold text-white md:text-xl">
          {paid <= 0
            ? <>Cashback ti může zaplatit <span className="text-accent">celé členství</span></>
            : ratio >= 1
              ? <>Cashback ti už zaplatil <span className="text-accent">{ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× tvoje roční členství</span></>
              : <>Cashback ti už vrátil <span className="text-accent">{Math.round(ratio * 100)} % ročního členství</span></>}
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
          <span>Cashback {fmtCzk(paid)}</span><span>Členství {fmtCzk(YEARLY_PRICE)} / rok</span>
        </div>
      </div>

      {/* Služby */}
      <section>
        <h2 className="font-display text-lg font-bold text-white">Co můžeš klientovi nabídnout</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SERVICES.map((s) => {
            const Icon = ICONS[s.icon];
            const rate = serviceRate(s, siteText);
            return (
              <button key={s.key} type="button" onClick={() => openForm(s.key)} className="flex flex-col rounded-2xl border border-white/10 bg-ink-850 p-5 text-left transition hover:border-accent/40">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent"><Icon className="h-4 w-4" /></span>
                <div className="mt-3 font-display font-bold text-white">{s.label}</div>
                <p className="mt-1 flex-1 text-sm text-zinc-400">{s.desc}</p>
                <div className="mt-4 border-t border-white/5 pt-3 text-sm font-semibold text-accent">
                  Cashback {rate ? `${rate.toLocaleString('cs-CZ')} % ` : ''}{s.basis}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Jak to funguje */}
      <section className="rounded-2xl border border-white/10 bg-ink-850 p-5">
        <h2 className="font-display text-lg font-bold text-white">Jak to funguje</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <div key={st.title} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent/50 text-sm font-bold text-accent">{i + 1}</span>
              <div>
                <div className="text-sm font-semibold text-white">{st.title}</div>
                <p className="mt-0.5 text-sm text-zinc-400">{st.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Moje doporučení */}
      <section className="rounded-2xl border border-white/10 bg-ink-850 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-white">Moje doporučení</h2>
          <button onClick={() => openForm()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:text-white">
            <Plus className="h-4 w-4" /> Nové doporučení
          </button>
        </div>
        {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Načítám…</div>
        ) : list.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-ink-950 p-6 text-center text-sm text-zinc-400">Zatím žádné doporučení. Prodáváš auto? Doporuč kupce a získej cashback.</p>
        ) : (
          <div className="mt-3 divide-y divide-white/5">
            {list.map((r) => <ReferralRow key={r.id} r={r} siteText={siteText} onChanged={load} />)}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-zinc-500">{disclaimer}</p>

      {formOpen && <ReferralForm preset={preset} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />}
    </div>
  );
}

function ReferralRow({ r, siteText, onChanged }) {
  const st = MEMBER_STATUS[r.status] || MEMBER_STATUS.new;
  const service = serviceByKey(r.service);
  const estimate = estimateCashback(service, r.vehicle_price, siteText);
  const amount = ['cashback_offered', 'paid'].includes(r.status) ? r.cashback_czk : null;

  return (
    <div className="py-3">
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[1.2fr_1fr_1.2fr_auto_auto]">
        <div className="font-medium text-white">{r.client_name}</div>
        <div className="text-zinc-400 sm:order-none">{service.short}</div>
        <div className="truncate text-zinc-400">{r.vehicle || '—'}</div>
        <div><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${st.tone}`}>{st.label}</span></div>
        <div className="text-right font-semibold">
          {amount != null
            ? <span className="text-white">{fmtCzk(amount)}</span>
            : r.status !== 'lost' && estimate
              ? <span className="font-normal text-zinc-500">odhad {fmtCzk(estimate)}</span>
              : <span className="text-zinc-600">–</span>}
        </div>
      </div>
      {r.admin_message && (
        <p className="mt-2 rounded-xl border border-white/10 bg-ink-950 p-3 text-sm text-zinc-300">{r.admin_message}</p>
      )}
      {r.status === 'cashback_offered' && <PayoutConfirm r={r} onChanged={onChanged} />}
    </div>
  );
}

/** Člen potvrdí účet, na který mu cashback pošleme. */
function PayoutConfirm({ r, onChanged }) {
  const [account, setAccount] = useState(r.payout_account || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!r.payout_confirmed_at);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await supabase.rpc('confirm_referral_payout', { referral_id: r.id, account });
    setBusy(false);
    if (err) { setError(err.message || 'Nepodařilo se uložit.'); return; }
    setEditing(false);
    onChanged();
  };

  if (!editing) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Výplata {fmtCzk(r.cashback_czk)} potvrzena na účet <span className="font-semibold">{r.payout_account}</span>. Pošleme ji co nejdřív.
        <button type="button" onClick={() => setEditing(true)} className="ml-auto text-xs text-zinc-400 underline hover:text-white">Změnit účet</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white"><Wallet className="h-4 w-4 text-accent" /> Cashback {fmtCzk(r.cashback_czk)} je připravený k výplatě</div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={account} onChange={(e) => setAccount(e.target.value)} required minLength={6} maxLength={60} placeholder="Číslo účtu, např. 123456789/0800"
          className="flex-1 rounded-xl border border-white/10 bg-ink-950 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/60" />
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Potvrdit výplatu
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}

/** Modal „Doporučit klienta". */
function ReferralForm({ preset, onClose, onSaved }) {
  const { siteText } = useApp();
  const [form, setForm] = useState({ service: preset, client_name: '', client_phone: '', client_email: '', vehicle: '', vehicle_price: '', note: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const service = serviceByKey(form.service);
  const price = Number(String(form.vehicle_price).replace(/\s/g, ''));
  const estimate = estimateCashback(service, price, siteText);
  const rate = serviceRate(service, siteText);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.consent) { setError('Potvrď prosím souhlas klienta s předáním kontaktu.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('referrals').insert({
      service: form.service,
      client_name: form.client_name.trim(),
      client_phone: form.client_phone.trim(),
      client_email: form.client_email.trim() || null,
      vehicle: form.vehicle.trim() || null,
      vehicle_price: Number.isFinite(price) && price > 0 ? price : null,
      note: form.note.trim() || null,
      consent: true,
    });
    setBusy(false);
    if (err) { setError(/row-level security/i.test(err.message) ? 'Doporučovat můžeš jen s aktivním členstvím.' : 'Doporučení se nepodařilo odeslat. Zkus to prosím znovu.'); return; }
    onSaved();
  };

  const input = 'w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20';

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink-950/85 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Doporučit klienta">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="animate-fade-up max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-6 sm:rounded-3xl md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Doporučit klienta</h2>
            <p className="mt-1 text-sm text-zinc-400">Specialista se klientovi ozve do 24 hodin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Zavřít" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-semibold text-white">Co klient potřebuje</span>
          <div className="grid grid-cols-2 gap-2">
            {SERVICES.map((s) => (
              <label key={s.key} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-3 text-sm transition ${form.service === s.key ? 'border-accent bg-accent/[0.06] text-white' : 'border-white/10 text-zinc-300 hover:border-white/20'}`}>
                <input type="radio" name="service" value={s.key} checked={form.service === s.key} onChange={set('service')} className="accent-[#39FF14]" />
                {s.short}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Jméno klienta"><input value={form.client_name} onChange={set('client_name')} required maxLength={120} placeholder="Jan Novák" autoComplete="off" className={input} /></Field>
          <Field label="Telefon"><input value={form.client_phone} onChange={set('client_phone')} required minLength={6} maxLength={30} type="tel" placeholder="+420 …" autoComplete="off" className={input} /></Field>
        </div>
        <div className="mt-3">
          <Field label={<>E-mail <span className="font-normal text-zinc-500">(nepovinné)</span></>}><input value={form.client_email} onChange={set('client_email')} type="email" maxLength={200} placeholder="jan@email.cz" autoComplete="off" className={input} /></Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vozidlo"><input value={form.vehicle} onChange={set('vehicle')} maxLength={120} placeholder="Škoda Octavia 2020" className={input} /></Field>
          <Field label="Cena vozidla (Kč)"><input value={form.vehicle_price} onChange={set('vehicle_price')} inputMode="numeric" placeholder="389 000" className={input} /></Field>
        </div>
        <div className="mt-3">
          <Field label="Poznámka pro specialistu"><textarea value={form.note} onChange={set('note')} rows={3} maxLength={2000} placeholder="Kdy se mu hodí volat, co přesně řeší…" className={`${input} resize-y`} /></Field>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
          <div>
            <div className="text-sm text-zinc-300">Odhadovaný cashback</div>
            <div className="text-xs text-zinc-500">Konečná částka podle uzavřené smlouvy</div>
          </div>
          <div className="text-right font-display text-xl font-bold text-accent md:text-2xl">
            {estimate ? fmtCzk(estimate) : <span className="text-base">{rate ? `${rate.toLocaleString('cs-CZ')} % ` : ''}{service.basis}</span>}
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <input type="checkbox" checked={form.consent} onChange={set('consent')} className="mt-0.5 h-4 w-4 shrink-0 accent-[#39FF14]" />
          Potvrzuji, že klient souhlasí s předáním svých kontaktních údajů zprostředkovateli za účelem nabídky.
        </label>

        {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

        <button type="submit" disabled={busy || !form.consent} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 font-semibold text-ink-950 shadow-glow transition enabled:hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Odeslat doporučení
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-white">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-850 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-2 font-display text-xl font-bold md:text-2xl ${accent ? 'text-accent' : 'text-white'}`}>{value}</div>
    </div>
  );
}
