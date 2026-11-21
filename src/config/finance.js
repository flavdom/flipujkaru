/* ============================================================
   Finanční služby / cashback za doporučení klienta.
   Sazby, zprostředkovatel a právní text se edituje v administraci
   (Texty webu → Finanční služby), ať nejde o zásah do kódu.
============================================================ */

export const SERVICES = [
  {
    key: 'insurance', label: 'Pojištění vozidla', short: 'Pojištění vozidla', icon: 'ShieldCheck',
    desc: 'Povinné ručení a havarijní pojištění pro kupce, kterému prodáváš auto.',
    rateKey: 'fin_rate_insurance', basis: 'z ročního pojistného',
    estimable: false, // pojistné z ceny auta neodhadneme
  },
  {
    key: 'loan', label: 'Úvěr na auto', short: 'Úvěr na auto', icon: 'Banknote',
    desc: 'Klient nemá celou částku? Financování přes našeho partnera, i bez akontace.',
    rateKey: 'fin_rate_loan', basis: 'z výše úvěru', estimable: true,
  },
  {
    key: 'leasing', label: 'Leasing pro firmy a OSVČ', short: 'Leasing', icon: 'FileText',
    desc: 'Finanční i operativní leasing, odpočet DPH a nákup auta do firmy.',
    rateKey: 'fin_rate_leasing', basis: 'z financované částky', estimable: true,
  },
  {
    key: 'refinancing', label: 'Refinancování', short: 'Refinancování', icon: 'RefreshCw',
    desc: 'Klient splácí drahý úvěr na auto? Převedeme ho na výhodnější podmínky.',
    rateKey: 'fin_rate_refinancing', basis: 'z refinancované částky', estimable: true,
  },
];

export const serviceByKey = (k) => SERVICES.find((s) => s.key === k) || SERVICES[0];

/** Sazba cashbacku v % z textů webu ("0,8" / "0.8" / "0,8 %") → číslo, nebo null. */
export function serviceRate(service, siteText) {
  const raw = (siteText?.[service.rateKey] || '').replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Odhad cashbacku z ceny vozu (jen u financování, kde je cena ≈ financovaná částka). */
export function estimateCashback(service, price, siteText) {
  const rate = serviceRate(service, siteText);
  const p = Number(price);
  if (!service.estimable || !rate || !Number.isFinite(p) || p <= 0) return null;
  return Math.round((p * rate) / 100);
}

/* ---------- Stavy ---------- */

// Pořadí pro „posunout na další krok" a progress bar v adminu
export const PIPELINE = [
  { key: 'taken', label: 'Převzato' },
  { key: 'contacted', label: 'Kontaktováno' },
  { key: 'offer', label: 'Nabídka' },
  { key: 'signed', label: 'Podepsáno' },
  { key: 'commission_received', label: 'Provize přijata' },
  { key: 'paid', label: 'Vyplaceno' },
];
const ORDER = ['new', 'taken', 'contacted', 'offer', 'signed', 'commission_received', 'cashback_offered', 'paid'];
export const statusRank = (s) => ORDER.indexOf(s);

const TONES = {
  zinc: 'bg-white/10 text-zinc-300',
  amber: 'bg-amber-500/15 text-amber-300',
  blue: 'bg-sky-500/15 text-sky-300',
  green: 'bg-accent-soft text-accent',
  red: 'bg-red-500/15 text-red-300',
};

// Jak stav vidí ADMIN
export const ADMIN_STATUS = {
  new: { label: 'Nové', tone: TONES.zinc },
  taken: { label: 'Převzato', tone: TONES.amber },
  contacted: { label: 'V jednání', tone: TONES.amber },
  offer: { label: 'Nabídka', tone: TONES.amber },
  signed: { label: 'Podepsáno', tone: TONES.blue },
  commission_received: { label: 'Provize přijata', tone: TONES.blue },
  cashback_offered: { label: 'Cashback nabídnut', tone: TONES.green },
  paid: { label: 'Vyplaceno', tone: TONES.green },
  lost: { label: 'Nezrealizováno', tone: TONES.red },
};

// Jak stav vidí ČLEN (méně detailů)
export const MEMBER_STATUS = {
  new: { label: 'Nové', tone: TONES.zinc },
  taken: { label: 'V jednání', tone: TONES.amber },
  contacted: { label: 'V jednání', tone: TONES.amber },
  offer: { label: 'V jednání', tone: TONES.amber },
  signed: { label: 'Smlouva podepsána', tone: TONES.blue },
  commission_received: { label: 'Smlouva podepsána', tone: TONES.blue },
  cashback_offered: { label: 'Potvrď výplatu', tone: TONES.green },
  paid: { label: 'Vyplaceno', tone: TONES.green },
  lost: { label: 'Nezrealizováno', tone: TONES.red },
};

// Filtry v adminu
export const ADMIN_FILTERS = [
  { key: 'all', label: 'Vše', match: () => true },
  { key: 'new', label: 'Nové', match: (s) => s === 'new' },
  { key: 'progress', label: 'V jednání', match: (s) => ['taken', 'contacted', 'offer'].includes(s) },
  { key: 'signed', label: 'Podepsáno', match: (s) => s === 'signed' },
  { key: 'commission', label: 'Provize přijata', match: (s) => ['commission_received', 'cashback_offered'].includes(s) },
  { key: 'paid', label: 'Vyplaceno', match: (s) => s === 'paid' },
  { key: 'lost', label: 'Nezrealizováno', match: (s) => s === 'lost' },
];

export const CLOSED_STATUSES = ['signed', 'commission_received', 'cashback_offered', 'paid'];
export const OPEN_STATUSES = ['new', 'taken', 'contacted', 'offer', 'signed', 'commission_received'];

export const DEFAULT_DISCLAIMER =
  'Jako člen klientovi pouze předáváš kontakt, neposkytuješ poradenství ani nesjednáváš smlouvy. ' +
  'Cashback se vyplácí po výplatě provize partnerem a podléhá zdanění podle podmínek programu.';

export const fmtCzk = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${new Intl.NumberFormat('cs-CZ').format(Math.round(Number(n)))} Kč`);
