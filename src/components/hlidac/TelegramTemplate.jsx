import { Fragment, useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, X, Save, RotateCcw, Loader2, Eye, EyeOff } from 'lucide-react';
import { hlidacApi } from '../../lib/hlidacApi.js';
import { useHlidac, Loading, ErrorBox } from './HlidacAdmin.jsx';

const input = 'w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-accent/60 focus:outline-none';
const MUST = ['headline', 'price']; // bez nich hlídač šablonu odmítne

export default function TelegramTemplate() {
  const [data, error, loading, reload] = useHlidac(() => hlidacApi.telegram());
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return <Editor data={data} onSaved={reload} />;
}

function Editor({ data, onSaved }) {
  const { lines } = data;
  const [tpl, setTpl] = useState(() => structuredClone(data.template));
  const [preview, setPreview] = useState(data.preview);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const used = new Set(tpl.blocks.flat());
  const unused = Object.keys(lines).filter((k) => !used.has(k));
  const dirty = JSON.stringify(tpl) !== JSON.stringify(data.template);

  // Živý náhled: hlídač zprávu vyrenderuje na ukázkovém autě, nic neukládá.
  useEffect(() => {
    if (!dirty) { setPreview(data.preview); return undefined; }
    const t = setTimeout(() => hlidacApi.previewTelegram(tpl).then((r) => { setPreview(r.preview); setMsg(null); }, (e) => setMsg({ ok: false, text: e.message })), 400);
    return () => clearTimeout(t);
  }, [tpl]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBlocks = (fn) => setTpl((t) => ({ ...t, blocks: fn(t.blocks.map((b) => [...b])).filter((b) => b.length) }));
  const move = (bi, li, d) => setBlocks((bs) => {
    const b = bs[bi]; const j = li + d;
    if (j >= 0 && j < b.length) [b[li], b[j]] = [b[j], b[li]];
    else if (bs[bi + d]) { const [k] = b.splice(li, 1); d < 0 ? bs[bi + d].push(k) : bs[bi + d].unshift(k); } // přes okraj do sousedního bloku
    return bs;
  });
  const moveBlock = (bi, d) => setBlocks((bs) => { if (bs[bi + d]) [bs[bi], bs[bi + d]] = [bs[bi + d], bs[bi]]; return bs; });
  const remove = (bi, li) => setBlocks((bs) => { bs[bi].splice(li, 1); return bs; });
  const add = (k, bi) => setBlocks((bs) => { bi == null || !bs[bi] ? bs.push([k]) : bs[bi].push(k); return bs; });

  const save = async () => {
    const missing = MUST.filter((k) => !used.has(k));
    if (missing.length) return setMsg({ ok: false, text: `Zpráva musí obsahovat: ${missing.map((k) => lines[k]).join(', ')}.` });
    setBusy(true); setMsg(null);
    try { await hlidacApi.saveTelegram(tpl); setMsg({ ok: true, text: 'Uloženo. Další alert z hlídače už přijde v novém tvaru.' }); onSaved(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-ink-850 p-4 sm:p-5">
          <h3 className="font-semibold text-white">Úvodní věta</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Nepovinné, přijde nad nadpis. Max 200 znaků, HTML se nepoužije.</p>
          <textarea className={`${input} mt-3`} rows={2} maxLength={200} value={tpl.intro} onChange={(e) => setTpl({ ...tpl, intro: e.target.value })} placeholder="např. Nová příležitost 🔥" aria-label="Úvodní věta" />
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-850 p-4 sm:p-5">
          <h3 className="font-semibold text-white">Řádky zprávy</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Bloky oddělí prázdný řádek. Šipkami měníš pořadí, šipka přes okraj bloku přesune řádek do sousedního.</p>
          <div className="mt-3 space-y-3">
            {tpl.blocks.map((b, bi) => (
              <div key={bi} className="rounded-xl border border-white/10 bg-ink-950 p-2">
                <div className="mb-1 flex items-center justify-between px-1 text-xs text-zinc-500">
                  <span>Blok {bi + 1}</span>
                  <span className="flex gap-1">
                    <IconBtn label="Blok nahoru" disabled={!bi} onClick={() => moveBlock(bi, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="Blok dolů" disabled={bi === tpl.blocks.length - 1} onClick={() => moveBlock(bi, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                  </span>
                </div>
                {b.map((k, li) => (
                  <div key={k} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <span className="flex-1 text-sm text-zinc-200">{lines[k]}{MUST.includes(k) && <span className="ml-1.5 text-xs text-zinc-500">povinné</span>}</span>
                    <IconBtn label={`${lines[k]} nahoru`} disabled={!bi && !li} onClick={() => move(bi, li, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label={`${lines[k]} dolů`} disabled={bi === tpl.blocks.length - 1 && li === b.length - 1} onClick={() => move(bi, li, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label={`Skrýt ${lines[k]}`} disabled={MUST.includes(k)} onClick={() => remove(bi, li)}><EyeOff className="h-3.5 w-3.5" /></IconBtn>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {unused.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Skryté řádky (klik = přidat na konec)</div>
              <div className="flex flex-wrap gap-2">
                {unused.map((k) => (
                  <button key={k} type="button" onClick={() => add(k, tpl.blocks.length - 1)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:border-white/25"><Eye className="h-3.5 w-3.5" /> {lines[k]}</button>
                ))}
              </div>
            </div>
          )}
          {tpl.blocks.length < 8 && unused.length > 0 && (
            <button type="button" onClick={() => add(unused[0], null)} className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"><Plus className="h-3.5 w-3.5" /> Nový blok s řádkem „{lines[unused[0]]}“</button>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-850 p-4 sm:p-5">
          <h3 className="font-semibold text-white">Tlačítko pod zprávou</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{'{portal}'} se nahradí názvem portálu. Max 60 znaků.</p>
          <input className={`${input} mt-3`} maxLength={60} value={tpl.button} onChange={(e) => setTpl({ ...tpl, button: e.target.value })} aria-label="Text tlačítka" />
        </section>

        <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/90 p-3 backdrop-blur">
          <button type="button" onClick={save} disabled={busy || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-glow hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Uložit zprávu
          </button>
          <button type="button" onClick={() => setTpl(structuredClone(data.default))} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white"><RotateCcw className="h-4 w-4" /> Výchozí tvar</button>
          {dirty && <button type="button" onClick={() => setTpl(structuredClone(data.template))} className="text-sm text-zinc-400 hover:text-white">Zahodit změny</button>}
          {msg && <span role="alert" className={`text-sm ${msg.ok ? 'text-accent' : 'text-red-400'}`}>{msg.text}</span>}
        </div>
      </div>

      <aside className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Náhled (ukázkové auto)</div>
        <div className="rounded-2xl bg-[#17212b] p-3">
          <div className="whitespace-pre-wrap break-words rounded-xl rounded-bl-sm bg-[#182533] p-3 text-[13px] leading-relaxed text-zinc-100 [&_a]:text-sky-400 [&_a]:underline">{telegramHtml(preview)}</div>
          <div className="mt-1.5 rounded-lg bg-[#2b5278]/60 py-2 text-center text-[13px] font-medium text-white">{(tpl.button || '').replace('{portal}', 'mobile.de')}</div>
        </div>
      </aside>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent">{children}</button>;
}

/** Telegram HTML → React prvky. Pustí jen b, i, s, u, code a odkazy http(s); zbytek jako prostý text (žádné innerHTML). */
const TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', S: 's', U: 'u', CODE: 'code' };
export function telegramHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (node, key) => {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return null;
    const kids = [...node.childNodes].map((n, i) => walk(n, i));
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      return /^https?:\/\//i.test(href) ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{kids}</a> : <Fragment key={key}>{kids}</Fragment>;
    }
    const Tag = TAGS[node.tagName];
    return Tag ? <Tag key={key}>{kids}</Tag> : <Fragment key={key}>{kids}</Fragment>;
  };
  return [...doc.body.childNodes].map((n, i) => walk(n, i));
}
