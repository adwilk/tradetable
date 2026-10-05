-- Return only the public-facing Discord profile fields for members of the
-- caller's trade night. Auth identities stay in auth.users.
create or replace function public.get_trade_night_member_profiles(p_trade_night_id uuid)
returns table (user_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'global_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'preferred_username'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'username'), '')
    ),
    coalesce(
      nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(u.raw_user_meta_data ->> 'picture', ''),
      nullif(u.raw_user_meta_data ->> 'image_url', '')
    )
  from public.trade_night_members m
  join auth.users u on u.id = m.user_id
  where m.trade_night_id = p_trade_night_id
    and exists (
      select 1
      from public.trade_night_members caller_membership
      where caller_membership.trade_night_id = p_trade_night_id
        and caller_membership.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_trade_night_member_profiles(uuid) from public, anon;
grant execute on function public.get_trade_night_member_profiles(uuid) to authenticated;
