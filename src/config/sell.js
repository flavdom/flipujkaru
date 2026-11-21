/* ============================================================
   „Prodáme ti auto" — volby formuláře, stavy pro admin a texty.
   Čísla (provize, doba odpovědi, adresa, odpovědi FAQ) se editují
   v administraci → Texty webu → Prodej auta.
============================================================ */

export const FUELS = ['Benzín', 'Nafta', 'Hybrid', 'Plug-in hybrid', 'Elektro', 'LPG / CNG'];
export const TRANSMISSIONS = ['Manuální', 'Automatická'];
export const SERVICE_HISTORY = ['Kompletní', 'Částečná', 'Žádná / nevím'];

export const CONDITIONS = [
  { key: 'none', label: 'Bez poškození' },
  { key: 'minor', label: 'Drobné vady (škrábance, ťukance)' },
  { key: 'major', label: 'Větší poškození nebo závada' },
];
export const conditionLabel = (k) => CONDITIONS.find((c) => c.key === k)?.label || k;

export const PHOTO_SHOTS = ['Zepředu', 'Zezadu', 'Oba boky', 'Interiér vpředu i vzadu', 'Tachometr (zapnuté zapalování)', 'Detail každého poškození'];

export const MIN_PHOTOS = 6;
export const MAX_PHOTOS = 20;

/** Výchozí odpovědi FAQ (prázdné = otázka se na webu neukáže, dokud ji nevyplníš v Textech webu). */
export const SELL_FAQ = [
  { q: 'Co když se auto neprodá?', key: 'sell_faq_unsold', fallback: '' },
  { q: 'Můžu chtít vyšší cenu, než navrhnete?', key: 'sell_faq_higher',
    fallback: 'Jasně. Řekneme ti, jak reálná je, a můžeme začít výš. Když se auto delší dobu neprodá, cenu spolu upravíme.' },
  { q: 'Kde je auto během prodeje?', key: 'sell_faq_where', fallback: '' },
  { q: 'Jak dlouho prodej trvá?', key: 'sell_faq_duration', fallback: '' },
  { q: 'Kdy dostanu peníze?', key: 'sell_faq_payout', fallback: '' },
];

/** „Ozveme se do X hodin." — nebo obecná věta, když X není vyplněné. */
export function responseLine(t) {
  const h = (t?.sell_response_hours || '').trim();
  return h ? `ozveme se do ${h} hodin.` : 'ozveme se co nejdřív.';
}

export const toNumber = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* ---------- Admin ---------- */
const TONES = {
  zinc: 'bg-white/10 text-zinc-300',
  amber: 'bg-amber-500/15 text-amber-300',
  blue: 'bg-sky-500/15 text-sky-300',
  green: 'bg-accent-soft text-accent',
  red: 'bg-red-500/15 text-red-300',
};

export const SELL_STATUS = {
  new: { label: 'Nová', tone: TONES.zinc },
  contacted: { label: 'Kontaktováno', tone: TONES.amber },
  priced: { label: 'Naceněno', tone: TONES.amber },
  contract: { label: 'Smlouva', tone: TONES.blue },
  listed: { label: 'V inzerci', tone: TONES.blue },
  sold: { label: 'Prodáno', tone: TONES.green },
  rejected: { label: 'Nedohodnuto', tone: TONES.red },
};
export const SELL_PIPELINE = ['new', 'contacted', 'priced', 'contract', 'listed', 'sold'];

export const SELL_FILTERS = [
  { key: 'all', label: 'Vše', match: () => true },
  { key: 'new', label: 'Nové', match: (s) => s === 'new' },
  { key: 'open', label: 'Rozjednané', match: (s) => ['contacted', 'priced'].includes(s) },
  { key: 'selling', label: 'V prodeji', match: (s) => ['contract', 'listed'].includes(s) },
  { key: 'sold', label: 'Prodáno', match: (s) => s === 'sold' },
  { key: 'rejected', label: 'Nedohodnuto', match: (s) => s === 'rejected' },
];
