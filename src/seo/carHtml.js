/* HTML detailu auta pro roboty a náhledy (funkce /auto/:slug) — vloží se na začátek
   stránky ještě před React; po načtení JS ho nahradí bazar s otevřeným detailem.
   Je v src/, aby Tailwind viděl použité třídy. */
import { carImages, carName, escapeHtml as e } from './site.js';

const fmt = (n) => new Intl.NumberFormat('cs-CZ').format(Math.round(Number(n) || 0));
const list = (title, items) => (Array.isArray(items) && items.length
  ? `<h2 class="mt-6 font-display text-lg font-bold text-white">${e(title)}</h2><ul class="mt-2 list-disc space-y-1 pl-5 text-zinc-400">${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`
  : '');

export function carArticleHtml(r) {
  const sold = r.status === 'sold';
  const img = carImages(r)[0];
  const name = carName(r);
  const specs = [
    ['Rok výroby', r.year],
    ['Najeto', r.km != null ? `${fmt(r.km)} km` : null],
    ['Motor', r.engine],
    ['Stav', r.condition],
    ['DPH', r.vat ? 'odpočet DPH možný' : null],
  ].filter(([, v]) => v);
  return `<article class="mx-auto max-w-4xl px-6 pb-12 pt-28 text-zinc-300">
  <a href="${sold ? '/nase-flipy' : '/bazar'}" class="text-sm text-zinc-400">← ${sold ? 'Naše flipy' : 'Bazar prověřených aut'}</a>
  <h1 class="mt-3 font-display text-3xl font-bold text-white md:text-4xl">${e(name)} (${e(r.year)})</h1>
  <p class="mt-2 font-display text-2xl font-bold text-accent">${sold ? 'Prodáno' : `${fmt(r.price)} Kč`}</p>
  ${img ? `<img src="${e(img)}" alt="${e(name)}" width="1200" height="750" class="mt-6 aspect-[16/10] w-full rounded-2xl object-cover" />` : ''}
  <dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">${specs.map(([k, v]) => `<div><dt class="text-xs text-zinc-500">${e(k)}</dt><dd class="text-white">${e(v)}</dd></div>`).join('')}</dl>
  ${r.story ? `<p class="mt-6 leading-relaxed">${e(r.story)}</p>` : ''}
  ${sold ? list('Co bylo potřeba opravit', r.problems) + list('Co jsme udělali', r.work) : ''}
</article>`;
}
