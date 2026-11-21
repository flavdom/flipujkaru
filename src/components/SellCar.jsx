import { useState } from 'react';
import { BadgeCheck, Wallet, PhoneOff, Plus, Check, ArrowRight } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import { SELL_FAQ, responseLine, toNumber } from '../config/sell.js';
import { czk } from '../data/content.js';
import Reveal from './Reveal.jsx';

// Formulář má vlastní stránku (reklama i odkazy můžou vést rovnou na něj)
export const SELL_FORM_PATH = '/prodej-auta/formular';

const PERKS = [
  { Icon: BadgeCheck, title: 'Férová cena podle trhu', text: 'Řekneme ti na rovinu, za kolik se auto reálně prodá.' },
  { Icon: Wallet, title: 'Nic neplatíš předem', text: 'Vyděláváme, až když se auto prodá.' },
  { Icon: PhoneOff, title: 'Žádné telefonáty a prohlídky', text: 'Zájemce, zkušební jízdy i papíry řešíme my.' },
];

const STEPS = [
  { title: 'Pošleš nám auto', text: 'Vyplníš formulář: fotky, VIN, stav tachometru a případná poškození. Zabere to pár minut.' },
  { title: 'Nacenění', text: 'Ozveme se s reálnou cenou podle trhu a společně se domluvíme na částce, kterou dostaneš.' },
  { title: 'Smlouva a focení', text: 'Sejdeme se u nás, nebo přijedeme k tobě. Podepíšeme smlouvu s tvojí cenou a auto nafotíme.' },
  { title: 'Prodej a výplata', text: 'Inzerci, zájemce, zkušební jízdy i přepis řešíme my. Po prodeji ti pošleme dohodnutou cenu.' },
];

/** Veřejný blok „Prodáme ti auto" (úvodní stránka i /prodej-auta). Formulář je na /prodej-auta/formular. */
export default function SellCar() {
  const { siteText: t } = useApp();

  const examplePrice = toNumber(t.sell_example_price) || 350000;
  const commission = toNumber(t.sell_example_commission);
  const faq = SELL_FAQ.map((f) => ({ q: f.q, a: (t[f.key] || f.fallback || '').trim() })).filter((f) => f.a);

  return (
    <section id="prodej-auta" className="relative scroll-mt-16 border-y border-white/5 bg-ink-900/40 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        {/* Hero */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t.sell_eyebrow || 'Prodáme ti auto'}</span>
            <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
              Ty dostaneš svou cenu. <span className="text-grad">My se postaráme o zbytek.</span>
            </h3>
            <p className="mt-4 max-w-lg text-zinc-400">
              {t.sell_subtitle || 'Předem se dohodneme, za kolik se tvoje auto reálně prodá. Tahle částka je tvoje. Naši provizi připočítáme k ceně pro kupce, takže z tvých peněz nic neubíráme.'}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={SELL_FORM_PATH} className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-ink-950 shadow-glow transition hover:brightness-110">
                Chci nacenit auto <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#prodej-auta-jak" onClick={(e) => { e.preventDefault(); document.getElementById('prodej-auta-jak')?.scrollIntoView({ behavior: 'smooth' }); }} className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3.5 font-semibold text-white transition hover:bg-white/5">
                Jak to funguje
              </a>
            </div>
          </Reveal>

          <Reveal delay={100} className="rounded-3xl border border-white/10 bg-ink-850 p-6 md:p-7">
            <div className="text-sm text-zinc-400">Jak se skládá prodejní cena</div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-accent/50 bg-accent/[0.06] p-4">
              <div>
                <div className="font-semibold text-white">Tvoje cena</div>
                <div className="text-xs text-zinc-400">Domluvíme se spolu, dostaneš ji celou</div>
              </div>
              <div className="whitespace-nowrap font-display text-xl font-bold text-accent sm:text-2xl">{czk(examplePrice)}</div>
            </div>
            <div className="py-2 text-center text-zinc-500">+</div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-ink-950 p-4">
              <div>
                <div className="font-semibold text-white">Naše provize</div>
                <div className="text-xs text-zinc-400">Platí ji kupec v ceně auta</div>
              </div>
              <div className="whitespace-nowrap font-display text-lg font-bold text-white sm:text-xl">{commission ? czk(commission) : 'dle dohody'}</div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 px-1 pt-4">
              <div className="font-semibold text-white">Cena v inzerátu</div>
              <div className="text-right font-display text-lg font-bold text-white sm:text-xl">
                {commission ? czk(examplePrice + commission) : <><span className="whitespace-nowrap">{czk(examplePrice)}</span> <span className="whitespace-nowrap">+ provize</span></>}
              </div>
            </div>
            <p className="mt-2 px-1 text-xs text-zinc-500">Příklad pro ilustraci. Konkrétní čísla dostaneš po ocenění.</p>
          </Reveal>
        </div>

        {/* Výhody */}
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {PERKS.map(({ Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 60} className="flex gap-3 rounded-2xl border border-white/10 bg-ink-850 p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <div className="font-semibold text-white">{title}</div>
                <div className="text-sm text-zinc-400">{text}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Jak to funguje */}
        <div id="prodej-auta-jak" className="scroll-mt-24 pt-16">
          <h4 className="font-display text-2xl font-bold text-white md:text-3xl">Jak to funguje</h4>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 60} className="rounded-2xl border border-white/10 bg-ink-850 p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-accent/50 font-display text-sm font-bold text-accent">{i + 1}</span>
                <div className="mt-4 font-semibold text-white">{s.title}</div>
                <p className="mt-1 text-sm text-zinc-400">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>

        {/* FAQ + CTA */}
        <div className={`mt-16 grid items-start gap-8 ${faq.length ? 'lg:grid-cols-2' : ''}`}>
          {faq.length > 0 && (
            <div>
              <h4 className="font-display text-2xl font-bold text-white md:text-3xl">Časté otázky</h4>
              <div className="mt-6 space-y-2.5">
                {faq.map((f) => <FaqItem key={f.q} item={f} />)}
              </div>
            </div>
          )}
          <Reveal className={`rounded-3xl border border-accent/50 bg-accent/[0.04] p-6 md:p-8 ${faq.length ? 'lg:mt-14' : 'mx-auto w-full max-w-2xl'}`}>
            <h4 className="font-display text-2xl font-bold text-white">Zjisti, za kolik se tvoje auto prodá</h4>
            <p className="mt-2 text-sm text-zinc-400">Pošli nám fotky a základní údaje. Nacenění je zdarma a nezávazné, {responseLine(t)}</p>
            <ul className="mt-5 space-y-2 text-sm text-zinc-200">
              {['Fotky auta zvenku i zevnitř', 'VIN a stav tachometru', 'Případná poškození'].map((x) => (
                <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> {x}</li>
              ))}
            </ul>
            <a href={SELL_FORM_PATH} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-ink-950 shadow-glow transition hover:brightness-110">
              Vyplnit formulář <ArrowRight className="h-4 w-4" />
            </a>
          </Reveal>
        </div>
      </div>

    </section>
  );
}

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border bg-ink-850 transition ${open ? 'border-accent/40' : 'border-white/10'}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 p-4 text-left">
        <span className="font-medium text-white">{item.q}</span>
        <Plus className={`h-5 w-5 shrink-0 text-accent transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
      <div className="grid transition-all duration-300" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-sm leading-relaxed text-zinc-400">{item.a}</p>
        </div>
      </div>
    </div>
  );
}
