-- Ranking background music: files live in a public Storage bucket, the playlist in a small table.
-- Writes happen only through the Supabase Dashboard / service role (no write grants for app roles).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ranking-music', 'ranking-music', true, 15728640, array['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ranking_music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  file_path text not null unique check (length(trim(file_path)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ranking_music_tracks enable row level security;
revoke all on public.ranking_music_tracks from public, anon, authenticated;
grant select on public.ranking_music_tracks to anon, authenticated;
grant all on public.ranking_music_tracks to service_role;

drop policy if exists "ranking_music_tracks_read_active" on public.ranking_music_tracks;
create policy "ranking_music_tracks_read_active" on public.ranking_music_tracks
for select to anon, authenticated using (active);

comment on table public.ranking_music_tracks is
  'Playlist for the ranking tab background music. file_path is the object path inside the ranking-music bucket.';
