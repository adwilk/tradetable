drop policy if exists "Signed-in users can create trade nights they own" on public.trade_nights;
create policy "Signed-in users can create trade nights they own"
  on public.trade_nights for insert to authenticated
  with check (owner_id = auth.uid());
