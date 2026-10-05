alter table public.trade_nights
  alter column owner_id set default auth.uid();
