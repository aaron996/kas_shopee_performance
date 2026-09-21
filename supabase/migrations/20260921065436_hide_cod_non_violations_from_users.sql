-- Users may see only source cases that remain relevant after Dev review.
-- A Dev Admin can still review every source row and every conclusion.

drop policy if exists "authenticated_can_read_kas_cod_suspicion_data" on public.kas_cod_suspicion_data;

create policy "authenticated_can_read_visible_cod_suspicion_data"
  on public.kas_cod_suspicion_data
  for select
  to authenticated
  using (
    (select public.is_cod_resolution_operator())
    or not exists (
      select 1
      from public.cod_suspicion_driver_resolutions resolution
      where resolution.driver_id = kas_cod_suspicion_data.driver_id
        and resolution.suspicion_type = kas_cod_suspicion_data.suspicion_type
        and resolution.finding_outcome = 'non_violation'
    )
  );

drop policy if exists "cod_resolution_operators_can_read" on public.cod_suspicion_driver_resolutions;

create policy "authenticated_can_read_violation_resolutions"
  on public.cod_suspicion_driver_resolutions
  for select
  to authenticated
  using (finding_outcome = 'violation');

create policy "cod_resolution_operators_can_read_all"
  on public.cod_suspicion_driver_resolutions
  for select
  to authenticated
  using ((select public.is_cod_resolution_operator()));
