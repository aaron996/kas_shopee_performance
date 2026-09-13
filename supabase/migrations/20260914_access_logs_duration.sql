-- Track session duration on access_logs so avg time-on-app can be computed per user.
-- The app writes `left_at` via a periodic heartbeat + on pagehide while the tab is open,
-- so (left_at - accessed_at) is an approximation bounded by the heartbeat interval,
-- not an exact session length.

alter table public.access_logs
  add column if not exists left_at timestamptz null;

create policy "authenticated users can update their own access log"
  on public.access_logs
  for update
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

grant update on public.access_logs to authenticated;
