-- TradeTable stores trade nights and cards only. Auth identities remain in
-- Supabase Auth; no profile, contact, or display-name table is created here.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trade_nights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  event_date date,
  event_time time,
  location text not null default '' check (char_length(location) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_night_members (
  trade_night_id uuid not null references public.trade_nights (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trade_night_id, user_id)
);

create table if not exists public.trade_night_invites (
  id uuid primary key default gen_random_uuid(),
  trade_night_id uuid not null references public.trade_nights (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.trade_cards (
  id uuid primary key default gen_random_uuid(),
  trade_night_id uuid not null references public.trade_nights (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  tcgdex_id text,
  name text not null check (char_length(name) between 1 and 160),
  set_name text not null default '',
  card_number text not null default '',
  rarity text not null default '',
  image_url text,
  color text not null default 'violet',
  wanted integer not null default 1 check (wanted between 1 and 999),
  has_to_trade boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists trade_nights_owner_updated_idx
  on public.trade_nights (owner_id, updated_at desc);
create index if not exists trade_night_members_user_idx
  on public.trade_night_members (user_id, trade_night_id);
create index if not exists trade_cards_night_idx
  on public.trade_cards (trade_night_id, created_at desc);
create index if not exists trade_cards_owner_idx
  on public.trade_cards (trade_night_id, owner_id);

-- Use a SECURITY DEFINER helper to avoid recursive membership RLS checks.
create or replace function public.is_trade_night_member(p_trade_night_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trade_night_members m
    where m.trade_night_id = p_trade_night_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.add_trade_night_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trade_night_members (trade_night_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists trade_night_owner_membership on public.trade_nights;
create trigger trade_night_owner_membership
after insert on public.trade_nights
for each row execute function public.add_trade_night_owner_as_member();

-- Invite tokens are returned once to the owner and only their hashes are stored.
create or replace function public.create_trade_night_invite(p_trade_night_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if not public.is_trade_night_member(p_trade_night_id) then
    raise exception 'Only event members can create an invite';
  end if;
  insert into public.trade_night_invites (trade_night_id, token_hash, created_by)
  values (
    p_trade_night_id,
    encode(extensions.digest(v_token::text, 'sha256'), 'hex'),
    (select auth.uid())
  );
  return v_token;
end;
$$;

create or replace function public.join_trade_night(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade_night_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before joining a trade night';
  end if;
  select i.trade_night_id into v_trade_night_id
  from public.trade_night_invites i
  where i.token_hash = encode(extensions.digest(p_token::text, 'sha256'), 'hex')
    and i.revoked_at is null;
  if v_trade_night_id is null then
    raise exception 'This invite is invalid or has been revoked';
  end if;
  insert into public.trade_night_members (trade_night_id, user_id, role)
  values (v_trade_night_id, (select auth.uid()), 'member')
  on conflict (trade_night_id, user_id) do nothing;
  return v_trade_night_id;
end;
$$;

create or replace function public.leave_trade_night(p_trade_night_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.trade_night_members m
  where m.trade_night_id = p_trade_night_id
    and m.user_id = (select auth.uid())
    and m.role = 'member';
  delete from public.trade_cards c
  where c.trade_night_id = p_trade_night_id
    and c.owner_id = (select auth.uid());
end;
$$;

alter table public.trade_nights enable row level security;
alter table public.trade_night_members enable row level security;
alter table public.trade_night_invites enable row level security;
alter table public.trade_cards enable row level security;

revoke all on public.trade_nights, public.trade_night_members,
  public.trade_night_invites, public.trade_cards from anon;
grant select, insert, update, delete on public.trade_nights,
  public.trade_night_members, public.trade_cards to authenticated;
revoke all on public.trade_night_invites from authenticated;

revoke all on function public.is_trade_night_member(uuid) from public, anon;
grant execute on function public.is_trade_night_member(uuid) to authenticated;
revoke all on function public.create_trade_night_invite(uuid) from public, anon;
grant execute on function public.create_trade_night_invite(uuid) to authenticated;
revoke all on function public.join_trade_night(uuid) from public, anon;
grant execute on function public.join_trade_night(uuid) to authenticated;
revoke all on function public.leave_trade_night(uuid) from public, anon;
grant execute on function public.leave_trade_night(uuid) to authenticated;

drop policy if exists "Members can view trade nights" on public.trade_nights;
create policy "Members can view trade nights"
  on public.trade_nights for select to authenticated
  using (public.is_trade_night_member(id));
drop policy if exists "Signed-in users can create trade nights they own" on public.trade_nights;
create policy "Signed-in users can create trade nights they own"
  on public.trade_nights for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "Owners can update trade nights" on public.trade_nights;
create policy "Owners can update trade nights"
  on public.trade_nights for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists "Owners can delete trade nights" on public.trade_nights;
create policy "Owners can delete trade nights"
  on public.trade_nights for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Members can view event membership" on public.trade_night_members;
create policy "Members can view event membership"
  on public.trade_night_members for select to authenticated
  using (public.is_trade_night_member(trade_night_id));
drop policy if exists "Owners can remove event members" on public.trade_night_members;
create policy "Owners can remove event members"
  on public.trade_night_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role = 'member')
    or (role = 'member' and exists (
      select 1 from public.trade_nights n
      where n.id = trade_night_id and n.owner_id = (select auth.uid())
    ))
  );

drop policy if exists "Event members can view card lists" on public.trade_cards;
create policy "Event members can view card lists"
  on public.trade_cards for select to authenticated
  using (public.is_trade_night_member(trade_night_id));
drop policy if exists "Members can manage their own cards" on public.trade_cards;
create policy "Members can manage their own cards"
  on public.trade_cards for all to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_trade_night_member(trade_night_id)
  )
  with check (
    owner_id = (select auth.uid())
    and public.is_trade_night_member(trade_night_id)
  );
