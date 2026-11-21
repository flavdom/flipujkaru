import { createClient } from '@supabase/supabase-js';
import { json } from '../_utils.js';

/**
 * Cloudflare Pages Function: veřejný formulář „Prodáme ti auto".
 * Přijme multipart (pole + fotky), ověří, nahraje fotky do soukromého
 * bucketu sell-photos a založí řádek v sell_requests (service role).
 * Z prohlížeče se do tabulky/bucketu zapsat nedá — jen přes tuhle funkci.
 *
 * Ochrana proti spamu: honeypot pole „website" + max. 5 žádostí / IP / 24 h
 * (KV CALC_USAGE, IP jen jako solený hash).
 */
const MIN_PHOTOS = 6;
const MAX_PHOTOS = 20;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_TOTAL = 80 * 1024 * 1024;
const DAILY_LIMIT = 5;
const BUCKET = 'sell-photos';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const EXT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };

async function hashIp(ip, salt) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${salt}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const str = (fd, k, max) => {
  const v = String(fd.get(k) ?? '').trim();
  return v ? v.slice(0, max) : '';
};
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export async function onRequestPost({ request, env }) {
  let fd;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: 'Formulář se nepodařilo přečíst. Zkus to prosím znovu.' }, 400);
  }

  // Honeypot — robot vyplní skryté pole; tvaříme se, že vše prošlo.
  if (str(fd, 'website', 200)) return json({ ok: true });

  // Rate limit podle IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = `sell:${await hashIp(ip, env.CALC_IP_SALT || 'salt')}`;
  const used = parseInt((await env.CALC_USAGE?.get(rlKey)) || '0', 10) || 0;
  if (used >= DAILY_LIMIT) {
    return json({ error: 'Z tohoto připojení už dnes přišlo několik žádostí. Zkus to prosím zítra, nebo nám zavolej.' }, 429);
  }

  // ---- Validace polí ----
  const errors = {};
  const brand = str(fd, 'brand', 60);
  const model = str(fd, 'model', 120);
  const year = parseInt(str(fd, 'year', 4), 10);
  const mileage = num(str(fd, 'mileage_km', 12));
  const vin = str(fd, 'vin', 40).toUpperCase().replace(/[\s-]/g, '');
  const condition = str(fd, 'condition', 10);
  const name = str(fd, 'name', 120);
  const phone = str(fd, 'phone', 30);
  const email = str(fd, 'email', 200);
  const city = str(fd, 'city', 100);
  const meeting = str(fd, 'meeting', 10);
  const priceRaw = str(fd, 'price_expectation', 20);
  const price = priceRaw ? num(priceRaw) : null;
  const thisYear = new Date().getFullYear();

  if (!brand) errors.brand = 'Vyplň značku.';
  if (!model) errors.model = 'Vyplň model.';
  if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) errors.year = 'Neplatný rok výroby.';
  if (mileage == null || mileage < 0 || mileage > 3000000) errors.mileage_km = 'Neplatný stav tachometru.';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) errors.vin = 'VIN má 17 znaků (bez písmen I, O, Q).';
  if (!['none', 'minor', 'major'].includes(condition)) errors.condition = 'Vyber stav vozu.';
  if (name.length < 2) errors.name = 'Vyplň jméno.';
  if (phone.replace(/\D/g, '').length < 9) errors.phone = 'Vyplň telefon.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Neplatný e-mail.';
  if (!city) errors.city = 'Vyplň, kde je auto.';
  if (!['ours', 'theirs'].includes(meeting)) errors.meeting = 'Vyber místo schůzky.';
  if (priceRaw && (price == null || price < 0)) errors.price_expectation = 'Neplatná cena.';
  if (fd.get('consent') !== 'true') errors.consent = 'Potřebujeme souhlas se zpracováním údajů.';

  // ---- Fotky ----
  const files = fd.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0);
  let total = 0;
  const photos = [];
  for (const f of files) {
    const ext = (f.name || '').split('.').pop().toLowerCase();
    const type = EXT[f.type] ? f.type : EXT_TYPE[ext];
    if (!type) { errors.photos = `Soubor „${f.name}" není fotka (JPG, PNG, WEBP nebo HEIC).`; break; }
    if (f.size > MAX_FILE) { errors.photos = `Fotka „${f.name}" je větší než 15 MB.`; break; }
    total += f.size;
    photos.push({ file: f, type });
  }
  if (!errors.photos && photos.length < MIN_PHOTOS) errors.photos = `Nahraj prosím aspoň ${MIN_PHOTOS} fotek.`;
  if (!errors.photos && photos.length > MAX_PHOTOS) errors.photos = `Maximálně ${MAX_PHOTOS} fotek.`;
  if (!errors.photos && total > MAX_TOTAL) errors.photos = 'Fotky jsou dohromady moc velké, zkus jich poslat méně.';

  if (Object.keys(errors).length) {
    return json({ error: Object.values(errors)[0], fields: errors }, 400);
  }

  // ---- Uložení ----
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const id = crypto.randomUUID();
  const paths = [];
  try {
    for (const [i, p] of photos.entries()) {
      const path = `${id}/${String(i + 1).padStart(2, '0')}.${EXT[p.type]}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, await p.file.arrayBuffer(), { contentType: p.type, upsert: false });
      if (error) throw new Error(`upload: ${error.message}`);
      paths.push(path);
    }

    const { error } = await admin.from('sell_requests').insert({
      id,
      brand, model, year, mileage_km: Math.round(mileage), vin,
      fuel: str(fd, 'fuel', 40) || null,
      transmission: str(fd, 'transmission', 40) || null,
      service_history: str(fd, 'service_history', 40) || null,
      condition,
      damage_note: str(fd, 'damage_note', 2000) || null,
      photos: paths,
      name, phone, email: email || null, city,
      price_expectation: price,
      meeting,
      consent: true,
    });
    if (error) throw new Error(`insert: ${error.message}`);
  } catch (e) {
    if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {});
    console.error('sell-request failed', e);
    return json({ error: 'Žádost se nepodařilo uložit. Zkus to prosím znovu, nebo nám zavolej.' }, 500);
  }

  await env.CALC_USAGE?.put(rlKey, String(used + 1), { expirationTtl: 60 * 60 * 24 });
  return json({ ok: true });
}
