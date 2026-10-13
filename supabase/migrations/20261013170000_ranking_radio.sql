-- Ranking radio: every listener derives the same track and position from one shared anchor
-- (track_id + started_at). Playlist order and durations make the rest deterministic on the client.
alter table public.ranking_music_tracks
  add column if not exists duration_seconds numeric check (duration_seconds is null or duration_seconds > 0);

create table if not exists public.ranking_radio_state (
  id boolean primary key default true check (id),
  track_id uuid references public.ranking_music_tracks(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.ranking_radio_state (id) values (true) on conflict (id) do nothing;

-- No direct table access: reads and writes go through the RPCs below.
alter table public.ranking_radio_state enable row level security;
revoke all on public.ranking_radio_state from public, anon, authenticated;
grant all on public.ranking_radio_state to service_role;

-- Shared anchor plus the server clock so clients can correct their own clock skew.
create or replace function public.get_ranking_radio()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'track_id', s.track_id,
    'started_at_ms', floor(extract(epoch from s.started_at) * 1000)::bigint,
    'server_now_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ) from public.ranking_radio_state s where s.id;
$$;

-- Dev-only: start a track now (or at an offset, used to keep the position stable after playlist edits).
create or replace function public.dev_ranking_radio_play(p_track_id uuid, p_offset_seconds numeric default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'RADIO_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ranking_music_tracks where id = p_track_id and active) then
    raise exception 'RADIO_TRACK_NOT_FOUND';
  end if;
  update public.ranking_radio_state
    set track_id = p_track_id,
        started_at = clock_timestamp() - make_interval(secs => greatest(coalesce(p_offset_seconds, 0), 0)),
        updated_by = auth.uid(),
        updated_at = now()
    where id;
  return public.get_ranking_radio();
end;
$$;

revoke all on function public.get_ranking_radio() from public;
revoke all on function public.dev_ranking_radio_play(uuid, numeric) from public, anon;
grant execute on function public.get_ranking_radio() to anon, authenticated, service_role;
grant execute on function public.dev_ranking_radio_play(uuid, numeric) to authenticated, service_role;
