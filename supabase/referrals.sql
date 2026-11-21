-- ============================================================
--  FlipujKáru — Finanční služby (cashback za doporučení klienta)
--  Člen předá kontakt na klienta (pojištění / úvěr / leasing /
--  refinancování), admin ho vyřídí a po přijetí provize partnera
--  nabídne členovi cashback. Člen potvrdí účet pro výplatu, admin
--  označí jako vyplaceno.
--  Spustíš v Supabase: SQL Editor → New query → vlož → RUN.
--  Bezpečné pustit i opakovaně. Vyžaduje courses.sql (has_course_access).
-- ============================================================

-- Je přihlášený uživatel admin? (SECURITY DEFINER → žádná rekurze přes RLS profiles)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admin potřebuje u doporučení vidět jméno/e-mail/plán člena.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------
--  Tabulka doporučení
-- ------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  -- odkaz na profiles (ne auth.users), ať jde v API vnořit profiles(full_name, …)
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,

  -- vyplňuje člen
  service text not null check (service in ('insurance', 'loan', 'leasing', 'refinancing')),
  client_name text not null check (char_length(client_name) between 1 and 120),
  client_phone text not null check (char_length(client_phone) between 6 and 30),
  client_email text check (client_email is null or char_length(client_email) <= 200),
  vehicle text check (vehicle is null or char_length(vehicle) <= 120),
  vehicle_price numeric check (vehicle_price is null or vehicle_price >= 0),
  note text check (note is null or char_length(note) <= 2000),
  consent boolean not null check (consent), -- klient souhlasí s předáním kontaktu

  -- zpracování (jen admin)
  status text not null default 'new' check (status in (
    'new',                 -- nové, čeká na převzetí
    'taken',               -- převzato
    'contacted',           -- klient kontaktován
    'offer',               -- nabídka odeslána
    'signed',              -- smlouva podepsána, čeká se na provizi partnera
    'commission_received', -- provize od partnera přijata
    'cashback_offered',    -- cashback nabídnut členovi, čeká na potvrzení účtu / výplatu
    'paid',                -- vyplaceno
    'lost'                 -- nezrealizováno
  )),
  handler text,                 -- kdo to řeší (specialista)
  partner text,                 -- partner / pojišťovna / banka
  commission_czk numeric check (commission_czk is null or commission_czk >= 0),
  member_share_pct numeric check (member_share_pct is null or member_share_pct between 0 and 100),
  cashback_czk numeric check (cashback_czk is null or cashback_czk >= 0),
  admin_message text check (admin_message is null or char_length(admin_message) <= 2000),

  -- výplata (potvrzuje člen přes confirm_referral_payout)
  payout_account text check (payout_account is null or char_length(payout_account) <= 60),
  payout_confirmed_at timestamptz,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referrals_user_id_idx on public.referrals (user_id);
create index if not exists referrals_status_idx on public.referrals (status);

alter table public.referrals enable row level security;

-- Člen vidí svoje, admin vše
drop policy if exists "referrals_select_own_or_admin" on public.referrals;
create policy "referrals_select_own_or_admin" on public.referrals
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

-- Doporučit smí jen člen s aktivním členstvím (nebo admin), a jen za sebe
drop policy if exists "referrals_insert_member" on public.referrals;
create policy "referrals_insert_member" on public.referrals
  for insert to authenticated with check (auth.uid() = user_id and public.has_course_access());

-- Zpracování a mazání jen admin
drop policy if exists "referrals_update_admin" on public.referrals;
create policy "referrals_update_admin" on public.referrals
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "referrals_delete_admin" on public.referrals;
create policy "referrals_delete_admin" on public.referrals
  for delete to authenticated using (public.is_admin());

-- Člen při vložení nesmí podstrčit stav, částky ani výplatní údaje
create or replace function public.referrals_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    new.status := 'new';
    new.handler := null; new.partner := null;
    new.commission_czk := null; new.member_share_pct := null; new.cashback_czk := null;
    new.admin_message := null;
    new.payout_account := null; new.payout_confirmed_at := null; new.paid_at := null;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists referrals_before_write on public.referrals;
create trigger referrals_before_write
  before insert or update on public.referrals
  for each row execute function public.referrals_before_write();

-- Člen potvrdí číslo účtu pro výplatu nabídnutého cashbacku (jediná změna,
-- kterou člen na doporučení smí udělat — update politika je jinak jen pro admina).
create or replace function public.confirm_referral_payout(referral_id uuid, account text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acc text := trim(coalesce(account, ''));
begin
  if char_length(acc) < 6 or char_length(acc) > 60 then
    raise exception 'Neplatné číslo účtu.';
  end if;
  update public.referrals
     set payout_account = acc, payout_confirmed_at = now()
   where id = referral_id
     and user_id = auth.uid()
     and status = 'cashback_offered';
  if not found then
    raise exception 'Doporučení nenalezeno nebo cashback není k potvrzení.';
  end if;
end;
$$;

revoke execute on function public.confirm_referral_payout(uuid, text) from public, anon;
grant execute on function public.confirm_referral_payout(uuid, text) to authenticated;
