import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, ImagePlus, X, Loader2, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import { goBackOr } from '../lib/router.js';
import {
  FUELS, TRANSMISSIONS, SERVICE_HISTORY, CONDITIONS, PHOTO_SHOTS, MIN_PHOTOS, MAX_PHOTOS, responseLine,
} from '../config/sell.js';

const MAX_SIDE = 2000; // fotky zmenšíme v prohlížeči → rychlé nahrání i z mobilu

/** Zmenší fotku na max. 2000 px (JPEG). Co prohlížeč neumí dekódovat (HEIC v Chrome), pošle se jak je. */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const EMPTY = {
  brand: '', model: '', year: '', mileage_km: '', vin: '', fuel: '', transmission: '', service_history: '',
  condition: 'none', damage_note: '', name: '', phone: '', email: '', city: '', price_expectation: '', meeting: 'ours',
  consent: false, website: '',
};

/** Stránka /prodej-auta/formular — „Pošli nám své auto" (veřejná, bez přihlášení). */
export default function SellCarForm() {
  const onClose = () => goBackOr('/prodej-auta');
  const { siteText: t, user } = useApp();
  const [f, setF] = useState(() => ({ ...EMPTY, email: user?.email || '' }));
  const [photos, setPhotos] = useState([]); // { id, file, url }
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // null | 0–100
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);
  const topRef = useRef(null);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  // Uvolni náhledy
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list) => {
    const incoming = Array.from(list || []).filter((file) => /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name));
    setPhotos((cur) => {
      const room = MAX_PHOTOS - cur.length;
      const next = incoming.slice(0, room).map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
      return [...cur, ...next];
    });
    if (errors.photos) setErrors((x) => ({ ...x, photos: undefined }));
  };
  const removePhoto = (id) => setPhotos((cur) => {
    const p = cur.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    return cur.filter((x) => x.id !== id);
  });

  const vinClean = f.vin.toUpperCase().replace(/[\s-]/g, '');

  const validate = () => {
    const e = {};
    const thisYear = new Date().getFullYear();
    if (!f.brand.trim()) e.brand = 'Vyplň značku.';
    if (!f.model.trim()) e.model = 'Vyplň model a motorizaci.';
    const y = parseInt(f.year, 10);
    if (!y || y < 1950 || y > thisYear + 1) e.year = 'Zadej rok výroby.';
    if (f.mileage_km === '' || Number(String(f.mileage_km).replace(/\s/g, '')) < 0) e.mileage_km = 'Zadej stav tachometru.';
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vinClean)) e.vin = 'VIN má 17 znaků (bez písmen I, O, Q).';
    if (photos.length < MIN_PHOTOS) e.photos = `Nahraj aspoň ${MIN_PHOTOS} fotek (teď ${photos.length}).`;
    if (f.name.trim().length < 2) e.name = 'Vyplň jméno a příjmení.';
    if (f.phone.replace(/\D/g, '').length < 9) e.phone = 'Vyplň telefon.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Neplatný e-mail.';
    if (!f.city.trim()) e.city = 'Vyplň, kde je auto.';
    if (!f.consent) e.consent = 'Bez souhlasu ti nemůžeme odpovědět.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setError('Zkontroluj prosím označená pole.');
      requestAnimationFrame(() => document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    setProgress(0);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, k === 'vin' ? vinClean : String(v)));
      const shrunk = await Promise.all(photos.map((p) => shrink(p.file)));
      shrunk.forEach((file) => fd.append('photos', file, file.name));

      const res = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/sell-request');
        xhr.upload.onprogress = (pe) => pe.lengthComputable && setProgress(Math.round((pe.loaded / pe.total) * 100));
        xhr.onload = () => {
          let body = {};
          try { body = JSON.parse(xhr.responseText); } catch { /* ne-JSON odpověď */ }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
        };
        xhr.onerror = () => reject(new Error('network'));
        xhr.send(fd);
      });

      if (!res.ok) {
        setErrors(res.body.fields || {});
        throw new Error(res.body.error || 'Odeslání se nepovedlo. Zkus to prosím znovu.');
      }
      setDone(true);
      topRef.current?.scrollIntoView();
    } catch (err) {
      setError(err.message === 'network' ? 'Nepodařilo se spojit se serverem. Zkontroluj připojení a zkus to znovu.' : err.message);
    } finally {
      setProgress(null);
    }
  };

  const sending = progress != null;
  const address = (t.sell_address || '').trim();
  const shotsLeft = Math.max(0, MIN_PHOTOS - photos.length);

  return (
    <div className="min-h-screen bg-ink-950">
      <div ref={topRef} className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Zpět na Prodáme ti auto
        </button>

        {done ? (
          <div className="mt-16 rounded-3xl border border-accent/40 bg-accent/[0.05] p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
            <h1 className="mt-4 font-display text-3xl font-bold text-white">Díky, máme to!</h1>
            <p className="mx-auto mt-3 max-w-md text-zinc-400">
              Auto si projdeme a {responseLine(t)} Zavoláme ti na {f.phone} s reálnou prodejní cenou. Nic neplatíš.
            </p>
            <a href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-ink-950 shadow-glow transition hover:brightness-110">
              Zpět na web
            </a>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-accent">Nezávazné nacenění</span>
            <h1 className="mt-2 font-display text-3xl font-bold text-white md:text-4xl">Pošli nám své auto</h1>
            <p className="mt-2 text-zinc-400">Čím přesnější údaje a fotky, tím přesnější cenu ti řekneme. {capitalize(responseLine(t))}</p>

            {/* Honeypot — lidé ho nevidí */}
            <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            {/* 1 Vozidlo */}
            <Card n={1} title="Vozidlo">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Značka" required error={errors.brand}><input value={f.brand} onChange={set('brand')} placeholder="Škoda" className={inp(errors.brand)} /></Field>
                <Field label="Model a motorizace" required error={errors.model}><input value={f.model} onChange={set('model')} placeholder="Octavia Combi 2.0 TDI" className={inp(errors.model)} /></Field>
                <Field label="Rok výroby" required error={errors.year}><input value={f.year} onChange={set('year')} inputMode="numeric" maxLength={4} placeholder="2019" className={inp(errors.year)} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Stav tachometru (km)" required error={errors.mileage_km}><input value={f.mileage_km} onChange={set('mileage_km')} inputMode="numeric" placeholder="142 000" className={inp(errors.mileage_km)} /></Field>
              </div>
              <Field label="VIN" required error={errors.vin} hint="Najdeš ho v malém technickém průkazu nebo pod čelním sklem. Podle VINu ověříme výbavu a historii.">
                <input value={f.vin} onChange={set('vin')} maxLength={20} placeholder="17 znaků, např. TMBJJ7NE0K0123456" className={`${inp(errors.vin)} font-mono uppercase`} autoCapitalize="characters" spellCheck={false} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Palivo"><Select value={f.fuel} onChange={set('fuel')} options={FUELS} /></Field>
                <Field label="Převodovka"><Select value={f.transmission} onChange={set('transmission')} options={TRANSMISSIONS} /></Field>
                <Field label="Servisní historie"><Select value={f.service_history} onChange={set('service_history')} options={SERVICE_HISTORY} /></Field>
              </div>
            </Card>

            {/* 2 Stav */}
            <Card n={2} title="Stav a poškození">
              <div className="grid gap-3 sm:grid-cols-3">
                {CONDITIONS.map((c) => (
                  <Choice key={c.key} active={f.condition === c.key} onClick={() => setF((x) => ({ ...x, condition: c.key }))}>{c.label}</Choice>
                ))}
              </div>
              <Field label="Popis poškození a závad">
                <textarea value={f.damage_note} onChange={set('damage_note')} rows={3} maxLength={2000} placeholder="Např. škrábanec na zadním nárazníku, svítí kontrolka motoru…" className={`${inp()} resize-y`} />
              </Field>
            </Card>

            {/* 3 Fotky */}
            <Card n={3} title="Fotky">
              <p className="text-sm text-zinc-400">Stačí mobil, za denního světla. Nafoť prosím tyto pohledy:</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {PHOTO_SHOTS.map((s) => (
                  <div key={s} className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-ink-950 p-3 text-center text-xs text-zinc-400">
                    <Camera className="h-4 w-4 text-zinc-500" /> {s}
                  </div>
                ))}
              </div>

              <div
                data-invalid={!!errors.photos}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                className={`rounded-2xl border border-dashed p-6 text-center transition ${errors.photos ? 'border-red-500/60 bg-red-500/5' : 'border-accent/50 bg-accent/[0.03]'}`}
              >
                <div className="font-semibold text-white">Nahraj fotky <span className="text-accent">*</span></div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-zinc-200 disabled:opacity-40">
                  <ImagePlus className="h-4 w-4" /> Vybrat fotky
                </button>
                <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                <p className="mt-2 text-xs text-zinc-500">Minimálně {MIN_PHOTOS} fotek, JPG nebo HEIC, až {MAX_PHOTOS} souborů. Můžeš je sem i přetáhnout.</p>
                {errors.photos && <p className="mt-2 text-sm text-red-400">{errors.photos}</p>}
              </div>

              {photos.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {photos.map((p) => (
                      <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-ink-950">
                        <img src={p.url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <span className="absolute inset-x-1 bottom-1 truncate text-[10px] text-zinc-500">{p.file.name}</span>
                        <button type="button" onClick={() => removePhoto(p.id)} aria-label="Odebrat fotku"
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-950/80 text-white transition hover:bg-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className={`text-xs ${shotsLeft ? 'text-amber-300' : 'text-zinc-500'}`}>
                    {photos.length} / {MAX_PHOTOS} fotek{shotsLeft ? ` · ještě aspoň ${shotsLeft}` : ''}
                  </p>
                </>
              )}
            </Card>

            {/* 4 Kontakt */}
            <Card n={4} title="Kontakt a schůzka">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Jméno a příjmení" required error={errors.name}><input value={f.name} onChange={set('name')} autoComplete="name" className={inp(errors.name)} /></Field>
                <Field label="Telefon" required error={errors.phone}><input value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" placeholder="+420 …" className={inp(errors.phone)} /></Field>
                <Field label="E-mail" error={errors.email}><input value={f.email} onChange={set('email')} type="email" autoComplete="email" className={inp(errors.email)} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Kde je auto (město)" required error={errors.city}><input value={f.city} onChange={set('city')} placeholder="Praha 5" className={inp(errors.city)} /></Field>
              </div>
              <Field label={<>Tvoje představa o ceně <span className="font-normal text-zinc-500">(nepovinné)</span></>} error={errors.price_expectation}>
                <div className="relative">
                  <input value={f.price_expectation} onChange={set('price_expectation')} inputMode="numeric" className={`${inp(errors.price_expectation)} pr-12`} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">Kč</span>
                </div>
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-white">Kde se potkáme při podpisu smlouvy</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice active={f.meeting === 'ours'} onClick={() => setF((x) => ({ ...x, meeting: 'ours' }))}>{address ? `U nás, ${address}` : 'U nás'}</Choice>
                  <Choice active={f.meeting === 'theirs'} onClick={() => setF((x) => ({ ...x, meeting: 'theirs' }))}>Přijeďte ke mně</Choice>
                </div>
              </div>
            </Card>

            <label data-invalid={!!errors.consent} className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={f.consent} onChange={set('consent')} className="mt-0.5 h-4 w-4 shrink-0 accent-[#39FF14]" />
              <span>
                Souhlasím se <a href="/gdpr" target="_blank" rel="noreferrer" className="underline decoration-white/30 hover:text-white">zpracováním osobních údajů</a> za účelem nacenění vozidla. Nacenění je nezávazné.
                {errors.consent && <span className="block text-red-400">{errors.consent}</span>}
              </span>
            </label>

            {error && <p className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

            <button type="submit" disabled={sending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 font-semibold text-ink-950 shadow-glow transition hover:brightness-110 disabled:opacity-60">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> {progress < 100 ? `Nahrávám fotky… ${progress} %` : 'Ukládám…'}</> : 'Odeslat k nacenění'}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">Po odeslání se ti ozveme s reálnou prodejní cenou. Nic neplatíš.</p>
          </form>
        )}
      </div>
    </div>
  );
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const inp = (err) =>
  `w-full rounded-xl border bg-ink-950 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:ring-2 ${
    err ? 'border-red-500/60 focus:ring-red-500/20' : 'border-white/10 focus:border-accent/60 focus:ring-accent/20'
  }`;

function Card({ n, title, children }) {
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-ink-850 p-5 md:p-6">
      <h2 className="font-display text-lg font-bold text-white"><span className="mr-1.5 text-accent">{n}</span> {title}</h2>
      {children}
    </section>
  );
}

function Field({ label, required, error, hint, children }) {
  return (
    <label className="block" data-invalid={!!error}>
      <span className="mb-1.5 block text-sm font-semibold text-white">{label}{required && <span className="text-accent"> *</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={`${inp()} appearance-none pr-9`}>
        <option value="">Vyber…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}

function Choice({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition ${active ? 'border-accent bg-accent/[0.06] font-semibold text-white' : 'border-white/10 bg-ink-950 text-zinc-300 hover:border-white/25'}`}>
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${active ? 'border-accent' : 'border-zinc-500'}`}>
        {active && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      {children}
    </button>
  );
}
