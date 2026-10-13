-- Dev-only management of the ranking music playlist from the frontend.
-- public.is_dev_admin() is true only for app_user_roles.role = 'dev' (or service_role); admins are excluded.
grant insert, update, delete on public.ranking_music_tracks to authenticated;

drop policy if exists "ranking_music_tracks_dev_read_all" on public.ranking_music_tracks;
create policy "ranking_music_tracks_dev_read_all" on public.ranking_music_tracks
for select to authenticated using ((select public.is_dev_admin()));

drop policy if exists "ranking_music_tracks_dev_insert" on public.ranking_music_tracks;
create policy "ranking_music_tracks_dev_insert" on public.ranking_music_tracks
for insert to authenticated with check ((select public.is_dev_admin()));

drop policy if exists "ranking_music_tracks_dev_update" on public.ranking_music_tracks;
create policy "ranking_music_tracks_dev_update" on public.ranking_music_tracks
for update to authenticated
using ((select public.is_dev_admin())) with check ((select public.is_dev_admin()));

drop policy if exists "ranking_music_tracks_dev_delete" on public.ranking_music_tracks;
create policy "ranking_music_tracks_dev_delete" on public.ranking_music_tracks
for delete to authenticated using ((select public.is_dev_admin()));

-- Storage: public bucket is readable by URL already; only dev may add, replace or remove objects.
drop policy if exists "ranking_music_objects_dev_select" on storage.objects;
create policy "ranking_music_objects_dev_select" on storage.objects
for select to authenticated
using (bucket_id = 'ranking-music' and (select public.is_dev_admin()));

drop policy if exists "ranking_music_objects_dev_insert" on storage.objects;
create policy "ranking_music_objects_dev_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'ranking-music' and (select public.is_dev_admin()));

drop policy if exists "ranking_music_objects_dev_update" on storage.objects;
create policy "ranking_music_objects_dev_update" on storage.objects
for update to authenticated
using (bucket_id = 'ranking-music' and (select public.is_dev_admin()))
with check (bucket_id = 'ranking-music' and (select public.is_dev_admin()));

drop policy if exists "ranking_music_objects_dev_delete" on storage.objects;
create policy "ranking_music_objects_dev_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'ranking-music' and (select public.is_dev_admin()));
