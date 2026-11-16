import Stripe from 'stripe';
import { json } from '../_utils.js';

/** Zkušební měsíc zdarma — jen u MĚSÍČNÍ varianty (interval month, count 1). */
const TRIAL_DAYS = 30;
const isMonthly = (price) => price?.recurring?.interval === 'month' && (price.recurring.interval_count || 1) === 1;

/** Měl už tenhle e-mail u nás někdy předplatné? (zkušební měsíc jen jednou na osobu) */
async function hadSubscription(stripe, email) {
  const raw = (email || '').trim();
  if (!raw) return false;
  for (const e of new Set([raw, raw.toLowerCase()])) {
    const { data: customers } = await stripe.customers.list({ email: e, limit: 10 });
    for (const c of customers) {
      const { data: subs } = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 1 });
      if (subs.length) return true;
    }
  }
  return false;
}

/**
 * Cloudflare Pages Function: vytvoří bezpečnou Stripe Checkout Session
 * pro OPAKOVANÉ PŘEDPLATNÉ. Běží na serveru — tajný klíč se nikdy nedostane do prohlížeče.
 *
 * Frontend pošle { priceId, email } → vrátíme { url } a přesměrujeme uživatele na Stripe.
 */
export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    const { priceId, email, planName, billing, yearly, userId, tg, promoCode, termsAccepted } = (await request.json()) || {};
    if (!priceId) return json({ error: 'Chybí priceId.' }, 400);
    // Souhlas s obchodními podmínkami (čl. 1.3, 5.3, 7.2) je povinný.
    if (termsAccepted !== true) return json({ error: 'Pro pokračování je nutné souhlasit s obchodními podmínkami.', field: 'terms' }, 400);

    // Odkud uživatel přišel (pro návratové URL)
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const meta = { planName: planName || '', billing: billing || '', yearly: String(!!yearly), userId: userId || '' };
    // Atribuce z Telegramu (?tg=…) — jen když je; Stripe metadata hodnota max. 500 znaků.
    if (typeof tg === 'string' && tg.trim()) meta.tg = tg.trim().slice(0, 500);
    // Doklad o souhlasu s podmínkami (čas odeslání objednávky).
    meta.termsAcceptedAt = new Date().toISOString();

    // Zkušební měsíc zdarma: rozhoduje server podle ceny (ne prohlížeč) a jen
    // pro e-mail, který u nás ještě předplatné neměl.
    const price = await stripe.prices.retrieve(priceId);
    const trial = isMonthly(price) && !(await hadSubscription(stripe, email));

    // Slevový kód zadaný v naší pokladně → uplatníme ho rovnou při vytvoření session.
    // (Pole pro kód na stránce Stripe v live režimu kódy odmítá jako neplatné,
    // přes API uplatněný kód funguje.) Discounts a allow_promotion_codes nejdou spolu.
    let discounts;
    const code = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';
    if (code) {
      const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
      if (!data.length) return json({ error: 'Neplatný nebo vypršelý slevový kód.', field: 'promoCode' }, 400);
      discounts = [{ promotion_code: data[0].id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', // opakované předplatné
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      client_reference_id: userId || undefined, // ke kterému účtu platba patří
      ...(discounts ? { discounts } : { allow_promotion_codes: true }), // slevové kódy
      billing_address_collection: 'auto',
      metadata: meta,
      // Karta se zadává vždy (i při 0 Kč ve zkušebním měsíci) — po jeho konci se z ní strhne první platba.
      payment_method_collection: 'always',
      subscription_data: {
        metadata: meta,
        ...(trial ? {
          trial_period_days: TRIAL_DAYS,
          // Bez platební metody na konci zkušební doby předplatné zruš (neposílej nezaplacenou fakturu).
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        } : {}),
      },
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      locale: 'cs',
    });

    return json({ url: session.url, trial });
  } catch (err) {
    // Kód existuje, ale nejde uplatnit (vyčerpaný, po platnosti, jiný produkt…)
    if (String(err.param || '').startsWith('discounts')) {
      return json({ error: 'Tento slevový kód už nejde uplatnit (vyčerpaný nebo po platnosti).', field: 'promoCode' }, 400);
    }
    console.error('Stripe checkout error:', err);
    return json({ error: err.message }, 500);
  }
}
