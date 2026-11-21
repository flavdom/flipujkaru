import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { json } from '../_utils.js';

/**
 * Cloudflare Pages Function: Faktury & platby přihlášeného člena.
 *  • GET  → skutečné faktury, uložená karta a stav předplatného přímo ze Stripe
 *  • POST → odkaz do zákaznického portálu Stripe (změna karty, faktury, zrušení)
 * Zákazníka bereme z profilu podle ověřeného tokenu — nikdy z prohlížeče.
 */

async function stripeCustomer(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'Nepřihlášeno.' }, 401) };
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { error: json({ error: 'Přihlášení vypršelo, přihlas se prosím znovu.' }, 401) };
  const { data: profile } = await admin
    .from('profiles').select('stripe_customer_id, stripe_subscription_id').eq('id', userData.user.id).single();
  return { customerId: profile?.stripe_customer_id || null, subscriptionId: profile?.stripe_subscription_id || null };
}

const periodEnd = (sub) => sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;

const cardOf = (pm) => (pm && typeof pm === 'object' && pm.card
  ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year }
  : null);

export async function onRequestGet({ request, env }) {
  try {
    const { error, customerId, subscriptionId } = await stripeCustomer(request, env);
    if (error) return error;
    if (!customerId) return json({ customer: false, invoices: [], card: null, subscription: null });

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const [invoices, customer, sub] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 24 }),
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
      subscriptionId
        ? stripe.subscriptions.retrieve(subscriptionId, { expand: ['default_payment_method'] }).catch(() => null)
        : null,
    ]);

    return json({
      customer: true,
      invoices: invoices.data
        .filter((i) => i.status !== 'draft')
        .map((i) => ({
          id: i.id,
          number: i.number,
          created: i.created,
          amount: (i.status === 'paid' ? i.amount_paid : i.total) / 100,
          currency: i.currency,
          status: i.status,
          item: (i.lines?.data?.[0]?.description || 'Členství FlipujKáru').replace(/^1 × /, ''),
          pdf: i.invoice_pdf || null,
          url: i.hosted_invoice_url || null,
        })),
      card: cardOf(sub?.default_payment_method) || cardOf(customer?.invoice_settings?.default_payment_method),
      subscription: sub
        ? { status: sub.status, cancelAtPeriodEnd: !!sub.cancel_at_period_end, periodEnd: periodEnd(sub) }
        : null,
    });
  } catch (err) {
    console.error('billing GET error:', err);
    return json({ error: 'Platby se teď nepodařilo načíst.' }, 500);
  }
}

/** Výchozí nastavení portálu (jen když ve Stripe ještě žádné není). */
export const PORTAL_CONFIG = {
  business_profile: { headline: 'FlipujKáru — správa členství' },
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    customer_update: { enabled: true, allowed_updates: ['address', 'tax_id', 'name'] },
  },
};

export async function onRequestPost({ request, env }) {
  try {
    const { error, customerId } = await stripeCustomer(request, env);
    if (error) return error;
    if (!customerId) return json({ error: 'K účtu zatím nepatří žádná platba.' }, 404);

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const params = { customer: customerId, return_url: `${origin}/?ucet=faktury` };
    let session;
    try {
      session = await stripe.billingPortal.sessions.create(params);
    } catch (err) {
      // Portál ve Stripe ještě nikdo nenastavil → založ výchozí konfiguraci a zkus znovu.
      if (!/configuration/i.test(err?.message || '')) throw err;
      const config = await stripe.billingPortal.configurations.create(PORTAL_CONFIG);
      session = await stripe.billingPortal.sessions.create({ ...params, configuration: config.id });
    }
    return json({ url: session.url });
  } catch (err) {
    console.error('billing POST error:', err);
    return json({ error: 'Správu plateb se teď nepodařilo otevřít.' }, 500);
  }
}
