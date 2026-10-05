create or replace function public.create_trade_night(
  p_name text,
  p_event_date date,
  p_event_time time,
  p_location text
)
returns setof public.trade_nights
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
    insert into public.trade_nights (owner_id, name, event_date, event_time, location)
    values (
      v_owner_id,
      coalesce(nullif(btrim(p_name), ''), 'My trade night'),
      p_event_date,
      p_event_time,
      coalesce(p_location, '')
    )
    returning *;
end;
$$;

revoke all on function public.create_trade_night(text, date, time, text) from public, anon, authenticated;
grant execute on function public.create_trade_night(text, date, time, text) to authenticated;
