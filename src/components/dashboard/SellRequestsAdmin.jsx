import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Phone, Mail, MapPin, CarFront, Check, AlertCircle, Trash2, ImageOff, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { SELL_STATUS, SELL_PIPELINE, SELL_FILTERS, conditionLabel, toNumber } from '../../config/sell.js';
import { fmtCzk } from '../../config/finance.js';

const BUCKET = 'sell-photos';

/** Administrace → Prodej aut (žádosti o nacenění z veřejného formuláře). */
export default function SellRequestsAdmin({ onCountChange }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);

  const load = async () => {
    const { data, error: err } = await supabase.from('sell_requests').select('*').order('created_at', { ascending: false });
    if (err) setError(`Žádosti se nepodařilo načíst: ${err.message}`);
    else {
      setList(data || []);
      setError('');
      onCountChange?.((data || []).filter((r) => r.status === 'new').length);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => Object.fromEntries(SELL_FILTERS.map((f) => [f.key, list.filter((r) => f.match(r.status)).length])), [list]);
  const q = query.trim().toLowerCase();
  const shown = list
    .filter((r) => SELL_FILTERS.find((f) => f.key === filter).match(r.status))
    .filter((r) => !q || [r.brand, r.model, r.name, r.phone, r.email, r.vin, r.city].some((v) => (v || '').toLowerCase().includes(q)));
  const selected = list.find((r) => r.id === selectedId) || null;
  const pipelineValue = list.filter((r) => ['contract', 'listed'].includes(r.status)).reduce((s, r) => s + Number(r.commission_czk || 0), 0);

  const select = (id) => {
    setSelectedId(id);
    if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Prodej aut</h1>
        <p className="mt-1 text-sm text-zinc-400">Žádosti o nacenění z formuláře „Prodáme ti auto". Zavolej, naceň, podepiš, prodej.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nové žádosti" value={counts.new ?? 0} accent />
        <Stat label="Rozjednané" value={counts.open ?? 0} />
        <Stat label="V prodeji" value={counts.selling ?? 0} />
        <Stat label="Provize v prodeji" value={fmtCzk(pipelineValue)} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SELL_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${filter === f.key ? 'border-accent bg-accent/[0.08] font-semibold text-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
              {f.label} · {counts[f.key] ?? 0}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat (auto, jméno, VIN…)"
          className="w-full rounded-xl border border-white/10 bg-ink-950 px-3.5 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/60 sm:ml-auto sm:w-64" />
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Načítám…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
          <div className="rounded-2xl border border-white/10 bg-ink-850 p-2">
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-500">Žádné žádosti v tomto filtru.</p>
            ) : shown.map((r) => {
              const st = SELL_STATUS[r.status];
              return (
                <button key={r.id} onClick={() => select(r.id)}
                  className={`block w-full rounded-xl border p-3.5 text-left transition ${r.id === selectedId ? 'border-accent bg-white/[0.03]' : 'border-transparent hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-white">{r.brand} {r.model}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${st.tone}`}>
                      {st.label}{r.status === 'new' ? ` · ${ago(r.created_at)}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-zinc-500">
                    {r.year} · {km(r.mileage_km)} · {r.name} · {r.city}
                  </div>
                </button>
              );
            })}
          </div>

          <div ref={detailRef} className="scroll-mt-20">
            {selected
              ? <Detail key={selected.id} r={selected} onSaved={load} onDeleted={() => { setSelectedId(null); load(); }} />
              : (
                <div className="hidden rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500 lg:block">
                  <CarFront className="mx-auto mb-2 h-6 w-6" /> Vyber žádost vlevo.
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ r, onSaved, onDeleted }) {
  const [f, setF] = useState({
    status: r.status,
    handler: r.handler || '',
    agreed_price_czk: r.agreed_price_czk ?? '',
    commission_czk: r.commission_czk ?? '',
    admin_note: r.admin_note || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF((x) => ({ ...x, [k]: e.target.value })); };

  const agreed = toNumber(f.agreed_price_czk);
  const commission = toNumber(f.commission_czk);

  const save = async (extra = {}) => {
    setBusy(true); setError(''); setSaved(false);
    const payload = {
      status: f.status,
      handler: f.handler.trim() || null,
      agreed_price_czk: agreed,
      commission_czk: commission,
      admin_note: f.admin_note.trim() || null,
      ...extra,
    };
    const { error: err } = await supabase.from('sell_requests').update(payload).eq('id', r.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (extra.status) setF((x) => ({ ...x, status: extra.status }));
    setSaved(true);
    onSaved();
  };

  const remove = async () => {
    if (!window.confirm(`Smazat žádost ${r.brand} ${r.model} (${r.name}) včetně fotek? Nejde to vrátit.`)) return;
    setBusy(true); setError('');
    if (r.photos?.length) {
      const { error: sErr } = await supabase.storage.from(BUCKET).remove(r.photos);
      if (sErr) { setBusy(false); setError(`Fotky se nepodařilo smazat: ${sErr.message}`); return; }
    }
    const { error: err } = await supabase.from('sell_requests').delete().eq('id', r.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDeleted();
  };

  const rank = SELL_PIPELINE.indexOf(r.status);
  const next = r.status !== 'rejected' && rank >= 0 && rank < SELL_PIPELINE.length - 1 ? SELL_PIPELINE[rank + 1] : null;
  const input = 'w-full rounded-xl border border-white/10 bg-ink-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-accent/60';
  const created = new Date(r.created_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-850 p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-white">{r.brand} {r.model}</h2>
          <div className="mt-0.5 text-sm text-zinc-500">Přijato {created}</div>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${SELL_STATUS[r.status].tone}`}>{SELL_STATUS[r.status].label}</span>
      </div>

      {/* Kontakt */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-ink-950 p-4">
        <div className="font-semibold text-white">{r.name}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 font-semibold text-accent hover:brightness-110"><Phone className="h-3.5 w-3.5" /> {r.phone}</a>
          {r.email && <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Nacenění: ${r.brand} ${r.model}`)}`} className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white"><Mail className="h-3.5 w-3.5" /> {r.email}</a>}
          <span className="inline-flex items-center gap-1.5 text-zinc-400"><MapPin className="h-3.5 w-3.5" /> {r.city}</span>
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          Schůzka: <span className="text-white">{r.meeting === 'ours' ? 'u nás' : 'přijet k majiteli'}</span>
          {' · '}Představa o ceně: <span className="text-white">{r.price_expectation != null ? fmtCzk(r.price_expectation) : 'neuvedena'}</span>
        </div>
      </div>

      {/* Vozidlo */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
        <Spec k="Rok" v={r.year} />
        <Spec k="Tachometr" v={km(r.mileage_km)} />
        <Spec k="VIN" v={<span className="select-all font-mono text-xs">{r.vin}</span>} />
        <Spec k="Palivo" v={r.fuel} />
        <Spec k="Převodovka" v={r.transmission} />
        <Spec k="Servisní historie" v={r.service_history} />
        <Spec k="Stav" v={conditionLabel(r.condition)} wide />
      </dl>
      {r.damage_note && <p className="mt-3 whitespace-pre-line rounded-xl border border-white/10 bg-ink-950 p-3 text-sm text-zinc-300"><span className="text-zinc-500">Poškození: </span>{r.damage_note}</p>}

      <Photos paths={r.photos || []} />

      {/* Zpracování */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Stav</span>
          <select value={f.status} onChange={set('status')} className={input}>
            {Object.entries(SELL_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Řeší</span>
          <input value={f.handler} onChange={set('handler')} placeholder="Kdo má žádost na starost" className={input} /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Dohodnutá cena pro majitele (Kč)</span>
          <input value={f.agreed_price_czk} onChange={set('agreed_price_czk')} inputMode="numeric" className={input} /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white">Naše provize (Kč)</span>
          <input value={f.commission_czk} onChange={set('commission_czk')} inputMode="numeric" className={input} /></label>
      </div>
      {agreed != null && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-sm">
          <span className="text-zinc-400">Cena v inzerátu</span>
          <span className="font-display text-lg font-bold text-white">{fmtCzk(agreed + (commission || 0))}</span>
        </div>
      )}

      <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-white">Interní poznámka</span>
        <textarea value={f.admin_note} onChange={set('admin_note')} rows={4} maxLength={4000}
          placeholder="Průběh hovorů, domluvené termíny, co je potřeba ověřit…" className={`${input} resize-y`} /></label>

      {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {next && f.status === r.status && (
          <button type="button" onClick={() => save({ status: next })} disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Posunout: {SELL_STATUS[next].label}
          </button>
        )}
        <button type="button" onClick={() => save()} disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-50">
          {saved ? <><Check className="h-4 w-4 text-accent" /> Uloženo</> : 'Uložit'}
        </button>
        <button type="button" onClick={remove} disabled={busy} title="Smazat žádost i fotky (např. na žádost klienta, GDPR)"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-400 transition hover:border-red-500/30 hover:text-red-300 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Smazat
        </button>
      </div>
    </div>
  );
}

/** Fotky ze soukromého bucketu přes podepsané URL (platí 1 h) + jednoduchý prohlížeč. */
function Photos({ paths }) {
  const [urls, setUrls] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!paths.length) { setUrls([]); return undefined; }
    supabase.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (alive) setUrls((data || []).map((d) => d.signedUrl).filter(Boolean));
    });
    return () => { alive = false; };
  }, [paths.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open == null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % urls.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + urls.length) % urls.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, urls]);

  if (urls == null) return <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Načítám fotky…</div>;
  if (!urls.length) return <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><ImageOff className="h-4 w-4" /> Bez fotek</div>;

  return (
    <>
      <div className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(i)} className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-ink-950">
            <img src={u} alt={`Fotka ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
          </button>
        ))}
      </div>
      {open != null && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <img src={urls[open]} alt="" className="max-h-[88vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-zinc-300">{open + 1} / {urls.length} · <a href={urls[open]} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>originál</a></div>
          <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" aria-label="Zavřít"><X className="h-5 w-5" /></button>
          {urls.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length); }} aria-label="Předchozí" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % urls.length); }} aria-label="Další" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"><ChevronRight className="h-5 w-5" /></button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Spec({ k, v, wide }) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-xs text-zinc-500">{k}</dt>
      <dd className="text-white">{v || '—'}</dd>
    </div>
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

const km = (n) => (n == null ? '—' : `${new Intl.NumberFormat('cs-CZ').format(n)} km`);

function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  return `před ${Math.round(h / 24)} d`;
}
