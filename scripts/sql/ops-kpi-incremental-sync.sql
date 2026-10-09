-- Sheet -> Supabase delta sync. Leadtime and legacy RPCs stay unchanged.
-- All four entry points are restricted to service_role. No natural unique key
-- is assumed: identical duplicate rows retain their multiplicity.
create or replace function public.ops_kpi_sync_spec(tab_key text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare tbl text; date_col text; cols jsonb;
begin
  case tab_key
    when 'pick' then tbl := 'kas_pick_data'; date_col := 'report_date';
    when 'deli' then tbl := 'kas_deli_data'; date_col := 'report_date';
    when 'ca1' then tbl := 'kas_ca1_data'; date_col := 'ngay';
    when 'fd' then tbl := 'kas_fd_data'; date_col := 'report_date';
    else raise exception 'Unsupported OPS tab: %', tab_key;
  end case;
  -- Metadata is read at execution time to reject unexpected schema changes.
  select jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) order by column_name collate "C")
  into cols from information_schema.columns
  where table_schema = 'public' and table_name = tbl and column_name not in ('id','synced_at');
  return jsonb_build_object('table',tbl,'date_column',date_col,'columns',cols);
end $$;
-- STABLE, since this function reads catalog metadata.
alter function public.ops_kpi_sync_spec(text) stable;

-- Internal query builder, with identifiers coming exclusively from the whitelist.
create or replace function public.ops_kpi_manifest_query(spec jsonb, relation_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare expr text;
begin
  select string_agg(case when c->>'type' = 'numeric'
    then format('trim_scale(t.%I)::text',c->>'name')
    else format('t.%I::text',c->>'name') end, ', ' order by ord)
  into expr from jsonb_array_elements(spec->'columns') with ordinality a(c,ord);
  return format($q$
    select coalesce(jsonb_agg(jsonb_build_object('day',day,'count',n,'hash',hash) order by day),'[]'::jsonb)
    from (select t.%I::text as day, count(*) n,
      md5(string_agg(md5(jsonb_build_array(%s)::text), E'\n' order by md5(jsonb_build_array(%s)::text) collate "C")) hash
      from %s t group by t.%I) d
  $q$,spec->>'date_column',expr,expr,relation_name,spec->>'date_column');
end $$;

create or replace function public.ops_kpi_sync_manifest(tab_key text)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare spec jsonb; days jsonb;
begin
  spec := public.ops_kpi_sync_spec(tab_key);
  execute public.ops_kpi_manifest_query(spec,format('public.%I',spec->>'table')) into days;
  return spec || jsonb_build_object('days',days,'token',md5(days::text));
end $$;

create or replace function public.sync_ops_kpi_delta(
  tab_key text, base_token text, source_days jsonb, changed_rows jsonb
) returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5min' as $$
declare
  spec jsonb; current_state jsonb; wanted jsonb; actual jsonb; changed_dates date[];
  tbl text; dc text; cols text; typed_cols text; ncols integer;
  deleted_n bigint := 0; inserted_n bigint := 0; kept_n bigint := 0; total_n bigint;
begin
  spec := public.ops_kpi_sync_spec(tab_key); tbl := spec->>'table'; dc := spec->>'date_column';
  if jsonb_typeof(source_days) is distinct from 'array' or jsonb_array_length(source_days)=0
    or jsonb_typeof(changed_rows) is distinct from 'array' then
    raise exception 'A nonempty complete source manifest and row array are required';
  end if;
  if exists(select 1 from jsonb_array_elements(source_days) d where
    coalesce(d->>'day','') !~ '^\d{4}-\d{2}-\d{2}$' or
    coalesce(d->>'count','') !~ '^[1-9][0-9]*$' or coalesce(d->>'hash','') !~ '^[0-9a-f]{32}$') or
    (select count(*)<>count(distinct d->>'day') from jsonb_array_elements(source_days) d) then
    raise exception 'Invalid or duplicate day in source manifest';
  end if;
  select jsonb_agg(jsonb_build_object('day',(d->>'day')::date::text,'count',(d->>'count')::bigint,'hash',d->>'hash') order by d->>'day'),
    sum((d->>'count')::bigint) into wanted,total_n from jsonb_array_elements(source_days) d;
  -- Excludes concurrent delta and legacy full-refresh writers; SELECT stays available.
  execute format('lock table public.%I in share row exclusive mode',tbl);
  current_state := public.ops_kpi_sync_manifest(tab_key);
  -- Lost response after COMMIT: retry is a no-op, even with the old base token.
  if current_state->'days' = wanted then
    return jsonb_build_object('inserted',0,'deleted',0,'retained',total_n,'changed_days',0,'source_rows',total_n,'unchanged',true);
  end if;
  if base_token is distinct from current_state->>'token' then
    raise exception using errcode='40001', message='OPS snapshot changed; reload manifest and retry';
  end if;
  select array_agg(coalesce(s.day,d.day)::date) into changed_dates
  from jsonb_to_recordset(wanted) s("day" text,count bigint,hash text)
  full join jsonb_to_recordset(current_state->'days') d("day" text,count bigint,hash text) using(day)
  where (s.count,s.hash) is distinct from (d.count,d.hash);
  ncols := jsonb_array_length(spec->'columns');
  if exists(select 1 from jsonb_array_elements(changed_rows) r
    where jsonb_typeof(r) is distinct from 'array' or jsonb_array_length(r)<>ncols) then
    raise exception 'Changed row has an invalid column count';
  end if;
  select string_agg(format('%I',c->>'name'),',' order by ord),
    string_agg(format('r.%I',c->>'name'),',' order by ord)
  into cols,typed_cols from jsonb_array_elements(spec->'columns') with ordinality a(c,ord);
  execute format('create temporary table ops_delta_incoming (like public.%I including defaults including identity) on commit drop',tbl);
  execute format($q$
    insert into pg_temp.ops_delta_incoming (%s)
    select %s from jsonb_array_elements($1) row_data
    cross join lateral (select jsonb_object_agg(c->>'name',row_data->(ord::integer-1)) obj
      from jsonb_array_elements($2) with ordinality a(c,ord)) o
    cross join lateral jsonb_populate_record(null::public.%I,o.obj) r
  $q$,cols,typed_cols,tbl) using changed_rows,spec->'columns';
  execute public.ops_kpi_manifest_query(spec,'pg_temp.ops_delta_incoming') into actual;
  if actual is distinct from (select coalesce(jsonb_agg(d order by d->>'day'),'[]'::jsonb)
    from jsonb_array_elements(wanted) d where (d->>'day')::date=any(changed_dates)) then
    raise exception 'Changed payload does not match source manifest; snapshot preserved';
  end if;
  -- Match the multiset of typed rows, preserving IDs for identical occurrences.
  execute format($q$
    create temporary table ops_delta_keep on commit drop as
    with old_rows as (select id,to_jsonb(t)-'id'-'synced_at' body,
      row_number() over(partition by to_jsonb(t)-'id'-'synced_at' order by id) occurrence
      from public.%I t where t.%I=any($1)),
    new_rows as (select to_jsonb(t)-'id'-'synced_at' body,
      row_number() over(partition by to_jsonb(t)-'id'-'synced_at') occurrence from pg_temp.ops_delta_incoming t)
    select o.id,o.body,o.occurrence from old_rows o join new_rows n using(body,occurrence)
  $q$,tbl,dc) using changed_dates;
  select count(*) into kept_n from pg_temp.ops_delta_keep;
  execute format('delete from public.%I t where t.%I=any($1) and not exists(select 1 from pg_temp.ops_delta_keep k where k.id=t.id)',tbl,dc) using changed_dates;
  get diagnostics deleted_n = row_count;
  execute format($q$
    insert into public.%I (%s)
    select %s from (select to_jsonb(t)-'id'-'synced_at' body,
      row_number() over(partition by to_jsonb(t)-'id'-'synced_at') occurrence from pg_temp.ops_delta_incoming t) n
    cross join lateral jsonb_populate_record(null::public.%I,n.body) r
    where not exists(select 1 from pg_temp.ops_delta_keep k where k.body=n.body and k.occurrence=n.occurrence)
  $q$,tbl,cols,typed_cols,tbl);
  get diagnostics inserted_n = row_count;
  -- Existing dashboard reader watches max(id),synced_at. Advance that boundary
  -- for every mutation, including delete-only changes to an older date.
  execute format('update public.%I set synced_at=clock_timestamp() where id=(select max(id) from public.%I)',tbl,tbl);
  current_state := public.ops_kpi_sync_manifest(tab_key);
  if current_state->'days' is distinct from wanted then
    raise exception 'Post-sync verification failed; transaction rolled back';
  end if;
  drop table pg_temp.ops_delta_keep, pg_temp.ops_delta_incoming;
  return jsonb_build_object('inserted',inserted_n,'deleted',deleted_n,'retained',total_n-inserted_n,
    'changed_days',cardinality(changed_dates),'source_rows',total_n,'unchanged',false);
end $$;

revoke all on function public.ops_kpi_sync_spec(text) from public,anon,authenticated;
revoke all on function public.ops_kpi_manifest_query(jsonb,text) from public,anon,authenticated;
revoke all on function public.ops_kpi_sync_manifest(text) from public,anon,authenticated;
revoke all on function public.sync_ops_kpi_delta(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ops_kpi_sync_spec(text), public.ops_kpi_manifest_query(jsonb,text),
  public.ops_kpi_sync_manifest(text), public.sync_ops_kpi_delta(text,text,jsonb,jsonb) to service_role;
