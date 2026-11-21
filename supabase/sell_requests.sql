-- ============================================================
--  FlipujKáru — „Prodáme ti auto" (žádosti o nacenění od veřejnosti)
--  Formulář na webu může vyplnit kdokoli (i nepřihlášený). Vkládá se
--  VÝHRADNĚ přes serverovou funkci /api/sell-request (service role,
--  rate-limit, validace) — z prohlížeče do tabulky ani bucketu zapsat nejde.
--  Číst / zpracovávat / mazat smí jen admin.
--  Spustíš v Supabase: SQL Editor → New query → vlož → RUN.
--  Bezpečné pustit i opakovaně. Vyžaduje referrals.sql (is_admin).
-- ============================================================

create table if not exists public.sell_requests (
  id uuid primary key default gen_random_uuid(),

  -- 1 Vozidlo
  brand text not null check (char_length(brand) between 1 and 60),
  model text not null check (char_length(model) between 1 and 120),
  year int not null check (year between 1950 and 2100),
  mileage_km int not null check (mileage_km between 0 and 3000000),
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  fuel text check (fuel is null or char_length(fuel) <= 40),
  transmission text check (transmission is null or char_length(transmission) <= 40),
  service_history text check (service_history is null or char_length(service_history) <= 40),

  -- 2 Stav
  condition text not null check (condition in ('none', 'minor', 'major')),
  damage_note text check (damage_note is null or char_length(damage_note) <= 2000),

  -- 3 Fotky (cesty v bucketu sell-photos)
  photos text[] not null default '{}',

  -- 4 Kontakt
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 6 and 30),
  email text check (email is null or char_length(email) <= 200),
  city text not null check (char_length(city) between 1 and 100),
  price_expectation numeric check (price_expectation is null or price_expectation >= 0),
  meeting text not null check (meeting in ('ours', 'theirs')),
  consent boolean not null check (consent),

  -- zpracování (admin)
  status text not null default 'new' check (status in (
    'new',        -- nová žádost
    'contacted',  -- kontaktováno
    'priced',     -- naceněno, čeká na odpověď
    'contract',   -- smlouva podepsána
    'listed',     -- v inzerci
    'sold',       -- prodáno a vyplaceno
    'rejected'    -- nedohodli jsme se / nezájem
  )),
  handler text check (handler is null or char_length(handler) <= 120),
  agreed_price_czk numeric check (agreed_price_czk is null or agreed_price_czk >= 0),
  commission_czk numeric check (commission_czk is null or commission_czk >= 0),
  admin_note text check (admin_note is null or char_length(admin_note) <= 4000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sell_requests_status_idx on public.sell_requests (status);
create index if not exists sell_requests_created_idx on public.sell_requests (created_at desc);

alter table public.sell_requests enable row level security;

-- Žádná insert politika → anon/authenticated vložit nemůžou (jen service role přes funkci).
drop policy if exists "sell_requests_select_admin" on public.sell_requests;
create policy "sell_requests_select_admin" on public.sell_requests
  for select to authenticated using (public.is_admin());

drop policy if exists "sell_requests_update_admin" on public.sell_requests;
create policy "sell_requests_update_admin" on public.sell_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sell_requests_delete_admin" on public.sell_requests;
create policy "sell_requests_delete_admin" on public.sell_requests
  for delete to authenticated using (public.is_admin());

create or replace function public.sell_requests_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sell_requests_touch on public.sell_requests;
create trigger sell_requests_touch
  before update on public.sell_requests
  for each row execute function public.sell_requests_touch();

-- ------------------------------------------------------------
--  Fotky: soukromý bucket. Nahrává jen funkce (service role),
--  admin čte přes podepsané URL a smí mazat.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sell-photos', 'sell-photos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sell_photos_select_admin" on storage.objects;
create policy "sell_photos_select_admin" on storage.objects
  for select to authenticated using (bucket_id = 'sell-photos' and public.is_admin());

drop policy if exists "sell_photos_delete_admin" on storage.objects;
create policy "sell_photos_delete_admin" on storage.objects
  for delete to authenticated using (bucket_id = 'sell-photos' and public.is_admin());
