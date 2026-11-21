import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Phone, Mail, Inbox, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  serviceByKey, ADMIN_STATUS, ADMIN_FILTERS, PIPELINE, statusRank, fmtCzk,
} from '../../config/finance.js';

/** Administrace → Doporučení od členů (cashback za finanční služby). */
export default function ReferralsAdmin({ onCountChange }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);

  const load = async () => {
    const { data, error: err } = await supabase
      .from('referrals')
      .select('*, member:profiles(full_name, email, plan)')
      .order('created_at', { ascending: false });
    if (err) setError(`Doporučení se nepodařilo načíst: ${err.message}`);
    else {
      setList(data || []);
      setError('');
      onCountChange?.((data || []).filter((r) => r.status === 'new').length);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => Object.fromEntries(ADMIN_FILTERS.map((f) => [f.key, list.filter((r) => f.match(r.status)).length])), [list]);
  const shown = list.filter((r) => ADMIN_FILTERS.find((f) => f.key === filter).match(r.status));
  const selected = list.find((r) => r.id === selectedId) || null;

  const toPay = list.filter((r) => r.status === 'cashback_offered').reduce((s, r) => s + Number(r.cashback_czk || 0), 0);

  const select = (id) => {
    setSelectedId(id);
    // Na mobilu je detail pod seznamem → posuň na něj
    if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Doporučení od členů</h1>
        <p className="mt-1 text-sm text-zinc-400">Převezmi doporučení, vyřiď ho s klientem a po přijetí provize nabídni členovi cashback.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nová k převzetí" value={counts.new ?? 0} accent />
        <Stat label="V jednání" value={counts.progress ?? 0} />
        <Stat label="Čeká na provizi partnera" value={counts.signed ?? 0} />
        <Stat label="K výplatě členům" value={fmtCzk(toPay)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {ADMIN_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${filter === f.key ? 'border-accent bg-accent/[0.08] font-semibold text-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
            {f.label} · {counts[f.key] ?? 0}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Načítám…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start">
          <div className="rounded-2xl border border-white/10 bg-ink-850 p-2">
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-500">Žádná doporučení v tomto filtru.</p>
            ) : shown.map((r) => {
              const st = ADMIN_STATUS[r.status];
              const active = r.id === selectedId;
              return (
                <button key={r.id} onClick={() => select(r.id)}
                  className={`block w-full rounded-xl border p-3.5 text-left transition ${active ? 'border-accent bg-white/[0.03]' : 'border-transparent hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-white">{r.client_name}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${st.tone}`}>
                      {st.label}{r.status === 'new' ? ` · ${ago(r.created_at)}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-zinc-500">
                    {serviceByKey(r.service).short}{r.vehicle ? ` · ${r.vehicle}` : ''} · od člena {memberName(r)}
                  </div>
                </button>
              );
            })}
          </div>

          <div ref={detailRef} className="scroll-mt-20">
            {selected
              ? <Detail key={selected.id} r={selected} onSaved={load} />
              : (
                <div className="hidden rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500 lg:block">
                  <Inbox className="mx-auto mb-2 h-6 w-6" /> Vyber doporučení vlevo.
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ r, onSaved }) {
  const service = serviceByKey(r.service);
  const [f, setF] = useState({
    handler: r.handler || '',
    partner: r.partner || '',
    commission_czk: r.commission_czk ?? '',
    member_share_pct: r.member_share_pct ?? 40,
    admin_message: r.admin_message || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF((x) => ({ ...x, [k]: e.target.value })); };

  const commission = Number(f.commission_czk) || 0;
  const share = Math.min(100, Math.max(0, Number(f.member_share_pct) || 0));
  const cashback = Math.round((commission * share) / 100);
  const rank = statusRank(r.status);
  const lost = r.status === 'lost';
  const showCashback = rank >= statusRank('signed') || lost;

  const defaultMessage = `Gratulujeme! Klient ${r.client_name} podepsal(a) smlouvu (${service.short.toLowerCase()}). Tvůj cashback ${fmtCzk(cashback)} je připravený k výplatě, potvrď prosím číslo účtu.`;

  const save = async (extra = {}) => {
    setBusy(true); setError(''); setSaved(false);
    const payload = {
      handler: f.handler.trim() || null,
      partner: f.partner.trim() || null,
      commission_czk: f.commission_czk === '' ? null : commission,
      member_share_pct: f.member_share_pct === '' ? null : share,
      admin_message: f.admin_message.trim() || null,
      ...extra,
    };
    const { error: err } = await supabase.from('referrals').update(payload).eq('id', r.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    onSaved();
  };

  const nextStep = PIPELINE.find((p) => statusRank(p.key) > rank && p.key !== 'paid');
  const offerCashback = () => {
    if (!commission) { setError('Vyplň provizi od partnera.'); return; }
    const message = f.admin_message.trim() || defaultMessage;
    setF((x) => ({ ...x, admin_message: message }));
    save({ status: 'cashback_offered', cashback_czk: cashback, admin_message: message });
  };
  const markPaid = () => {
    if (!window.confirm(`Opravdu označit ${fmtCzk(r.cashback_czk)} jako vyplacené na účet ${r.payout_account}?`)) return;
    save({ status: 'paid', paid_at: new Date().toISOString() });
  };

  const input = 'w-full rounded-xl border border-white/10 bg-ink-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-accent/60';

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-850 p-5 md:p-6">
      <h2 className="font-display text-2xl font-bold text-white">{r.client_name}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
        <a href={`tel:${r.client_phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-white hover:text-accent"><Phone className="h-3.5 w-3.5" /> {r.client_phone}</a>
        {r.client_email && <a href={`mailto:${r.client_email}`} className="inline-flex items-center gap-1 hover:text-white"><Mail className="h-3.5 w-3.5" /> {r.client_email}</a>}
      </div>
      <div className="mt-1 text-sm text-zinc-400">
        {service.label}{r.vehicle ? ` · ${r.vehicle}` : ''}{r.vehicle_price ? ` · ${fmtCzk(r.vehicle_price)}` : ''}
      </div>
      <div className="mt-1 text-sm text-zinc-500">
        Doporučil <span className="font-semibold text-white">{memberName(r)}</span>
        {r.member?.email ? ` (${r.member.email})` : ''}{r.member?.plan ? ` · Plán ${r.member.plan}` : ''} · {new Date(r.created_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
      {r.note && <p className="mt-3 rounded-xl border border-white/10 bg-ink-950 p-3 text-sm text-zinc-300"><span className="text-zinc-500">Poznámka člena: </span>{r.note}</p>}

      {/* Průběh */}
      {lost ? (
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">Označeno jako nezrealizované.</p>
      ) : (
        <div className="mt-5 grid grid-cols-6 gap-1.5">
          {PIPELINE.map((p) => {
            const done = statusRank(r.status) >= statusRank(p.key);
            const current = r.status === p.key || (r.status === 'cashback_offered' && p.key === 'commission_received');
            return (
              <div key={p.key}>
                <div className={`h-1.5 rounded-full ${done ? 'bg-accent' : 'bg-white/10'}`} />
                <div className={`mt-1.5 truncate text-[11px] ${current ? 'font-semibold text-white' : 'text-zinc-500'}`} title={p.label}>{p.label}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Řeší</span>
          <input value={f.handler} onChange={set('handler')} placeholder="Jméno specialisty" className={input} /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Partner / pojišťovna</span>
          <input value={f.partner} onChange={set('partner')} placeholder="Banka, pojišťovna…" className={input} /></label>
      </div>

      {showCashback && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-ink-950 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Výpočet cashbacku</span>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Provize od partnera (Kč)</span>
              <input type="number" min="0" value={f.commission_czk} onChange={set('commission_czk')} disabled={rank >= statusRank('cashback_offered')} className={`${input} disabled:opacity-60`} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Podíl člena (%)</span>
              <input type="number" min="0" max="100" value={f.member_share_pct} onChange={set('member_share_pct')} disabled={rank >= statusRank('cashback_offered')} className={`${input} disabled:opacity-60`} /></label>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-white/5 pt-3">
            <div>
              <div className="text-xs text-zinc-500">Cashback pro člena</div>
              <div className="font-display text-2xl font-bold text-accent">{fmtCzk(r.cashback_czk ?? cashback)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Zůstává FlipujKáru</div>
              <div className="font-display text-2xl font-bold text-white">{fmtCzk(commission - (r.cashback_czk ?? cashback))}</div>
            </div>
          </div>
        </div>
      )}

      {r.status === 'cashback_offered' && (
        r.payout_confirmed_at
          ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Člen potvrdil výplatu na účet <span className="font-semibold">{r.payout_account}</span>.</p>
          : <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">Čeká se, až člen potvrdí číslo účtu pro výplatu.</p>
      )}
      {r.status === 'paid' && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Vyplaceno {fmtCzk(r.cashback_czk)} na účet {r.payout_account}{r.paid_at ? ` (${new Date(r.paid_at).toLocaleDateString('cs-CZ')})` : ''}.</p>
      )}

      <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-white">Zpráva členovi</span>
        <textarea value={f.admin_message} onChange={set('admin_message')} rows={3} maxLength={2000}
          placeholder={r.status === 'commission_received' ? defaultMessage : 'Člen ji uvidí u doporučení ve své zóně.'}
          className={`${input} resize-y`} /></label>

      {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

      {/* Akce */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {r.status === 'new' && <Primary busy={busy} onClick={() => save({ status: 'taken' })}>Převzít doporučení</Primary>}
        {!lost && nextStep && r.status !== 'new' && rank < statusRank('commission_received') && (
          <Primary busy={busy} onClick={() => save({ status: nextStep.key })}>Posunout: {nextStep.label}</Primary>
        )}
        {r.status === 'commission_received' && <Primary busy={busy} onClick={offerCashback}>Nabídnout cashback členovi</Primary>}
        {r.status === 'cashback_offered' && (
          <Primary busy={busy} disabled={!r.payout_confirmed_at} onClick={markPaid}>Označit jako vyplaceno</Primary>
        )}
        {lost && <Primary busy={busy} onClick={() => save({ status: 'taken' })}>Obnovit doporučení</Primary>}

        <button type="button" onClick={() => save()} disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-50">
          {saved ? <><Check className="h-4 w-4 text-accent" /> Uloženo</> : 'Uložit'}
        </button>
        {!lost && !['paid', 'cashback_offered'].includes(r.status) && (
          <button type="button" onClick={() => window.confirm('Označit doporučení jako nezrealizované?') && save({ status: 'lost' })} disabled={busy}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-red-500/30 hover:text-red-300 disabled:opacity-50">
            Nezrealizováno
          </button>
        )}
      </div>
    </div>
  );
}

function Primary({ busy, disabled, onClick, children }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled}
      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />} {children}
    </button>
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

const memberName = (r) => r.member?.full_name || r.member?.email || 'člen';

function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  return `před ${Math.round(h / 24)} d`;
}
