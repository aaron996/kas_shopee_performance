-- Aggregate service-only history through an app-authorized private reader.
-- No grants on history tables and no changes to RLS.
create schema if not exists chat_data_private;
revoke all on schema chat_data_private from public, anon;
grant usage on schema chat_data_private to authenticated, service_role;
create or replace function chat_data_private.metric_rows(
  p_metric text, p_client text, p_from date, p_to date)
returns table(report_date date, client_name text, raw_region text, hub text,
  raw_hub_type text, denominator numeric, numerator numeric, synced_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (auth.uid() is null or not public.can_access_app()) then
    raise exception 'AI_CHAT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_metric not in ('p1st','opr','d1st','odr') or p_metric is null
     or p_from is null or p_to is null or p_from > p_to or p_to-p_from > 90 then
    raise exception 'AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;
  if p_metric in ('p1st','opr') then
    return query select t.report_date, upper(coalesce(t.client_name,'')),
      coalesce(t.region,'Không rõ'), coalesce(t.hub,'Không rõ'),
      coalesce(t.hub_type,'Không rõ'), t.mau_pu,
      case when p_metric='p1st' then t.ontime_pu_1st else t.ontime_pu_opr end, t.synced_at
    from public.kas_pick_history t
    where t.report_date between p_from and p_to
      and (p_client='ALL' or upper(t.client_name)=p_client);
  else
    return query select t.report_date, upper(coalesce(t.client_name,'')),
      coalesce(t.region,'Không rõ'), coalesce(t.hub,'Không rõ'),
      coalesce(t.hub_type,'Không rõ'), t.mau_deli,
      case when p_metric='d1st' then t.ontime_deli_1st else t.ontime_deli_odr end, t.synced_at
    from public.kas_deli_history t
    where t.report_date between p_from and p_to
      and (p_client='ALL' or upper(t.client_name)=p_client);
  end if;
end $$;
revoke all on function chat_data_private.metric_rows(text,text,date,date) from public, anon;
grant execute on function chat_data_private.metric_rows(text,text,date,date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ai_chat_metric(p_metric text, p_client text, p_date_from date, p_date_to date, p_grain text, p_regions text[], p_hub_types text[], p_limit integer, p_sort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to
     or p_date_to-p_date_from > 90 or p_metric is null or p_grain is null or p_sort is null or p_limit is null
     or p_metric not in ('p1st', 'opr', 'd1st', 'odr')
     or p_grain not in ('nationwide', 'region', 'hub')
     or p_sort not in ('worst', 'best', 'volume_desc')
     or p_limit not between 1 and 50 then
    raise exception 'AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_metric in ('p1st', 'opr') then
    with raw as (
      select * from chat_data_private.metric_rows(p_metric,p_client,p_date_from,p_date_to)
    ), source as (
      select
        report_date, client_name, hub, denominator, numerator, synced_at,
        case
          when lower(btrim(hub)) = 'key account warehouse ho chi minh' then 'HCM - KA'
          when lower(btrim(hub)) = '(hno) lh long biên' then 'HNO - KA'
          when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HCM' then 'HCM - KA'
          when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HNO' then 'HNO - KA'
          when upper(btrim(raw_hub_type)) = 'GXT' then coalesce(public.gxt_mien_region(hub, raw_region), raw_region)
          else raw_region
        end as region,
        case when lower(btrim(hub)) = '(hno) lh long biên' then 'KA' else raw_hub_type end as hub_type
      from raw
    ), scoped as (
      select *, case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then region else hub end as entity
      from source
      where report_date between p_date_from and p_date_to
        and (p_client = 'ALL' or client_name = p_client)
        and (coalesce(array_length(p_regions, 1), 0) = 0 or region = any(p_regions))
        and (coalesce(array_length(p_hub_types, 1), 0) = 0 or hub_type = any(p_hub_types))
    ), grouped as (
      select entity, sum(denominator) as volume, sum(numerator) as ontime,
        round(100 * sum(numerator) / nullif(sum(denominator), 0), 2) as value
      from scoped group by entity
    ), ranked as (
      select * from grouped
      order by
        case when p_sort = 'worst' then value end asc nulls last,
        case when p_sort = 'best' then value end desc nulls last,
        case when p_sort = 'volume_desc' then volume end desc nulls last,
        entity asc limit p_limit
    )
    select jsonb_build_object(
      'metric', p_metric,
      'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
      'dataAsOf', (select max(report_date) from scoped),
      'syncedAt', (select max(synced_at) from scoped),
      'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
    ) into v_result;
  else
    with raw as (
      select * from chat_data_private.metric_rows(p_metric,p_client,p_date_from,p_date_to)
    ), source as (
      select
        report_date, client_name, hub, denominator, numerator, synced_at,
        case
          when lower(btrim(hub)) = 'key account warehouse ho chi minh' then 'HCM - KA'
          when lower(btrim(hub)) = '(hno) lh long biên' then 'HNO - KA'
          when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HCM' then 'HCM - KA'
          when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HNO' then 'HNO - KA'
          when upper(btrim(raw_hub_type)) = 'GXT' then coalesce(public.gxt_mien_region(hub, raw_region), raw_region)
          else raw_region
        end as region,
        case when lower(btrim(hub)) = '(hno) lh long biên' then 'KA' else raw_hub_type end as hub_type
      from raw
    ), scoped as (
      select *, case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then region else hub end as entity
      from source
      where report_date between p_date_from and p_date_to
        and (p_client = 'ALL' or client_name = p_client)
        and (coalesce(array_length(p_regions, 1), 0) = 0 or region = any(p_regions))
        and (coalesce(array_length(p_hub_types, 1), 0) = 0 or hub_type = any(p_hub_types))
    ), grouped as (
      select entity, sum(denominator) as volume, sum(numerator) as ontime,
        round(100 * sum(numerator) / nullif(sum(denominator), 0), 2) as value
      from scoped group by entity
    ), ranked as (
      select * from grouped
      order by
        case when p_sort = 'worst' then value end asc nulls last,
        case when p_sort = 'best' then value end desc nulls last,
        case when p_sort = 'volume_desc' then volume end desc nulls last,
        entity asc limit p_limit
    )
    select jsonb_build_object(
      'metric', p_metric,
      'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
      'dataAsOf', (select max(report_date) from scoped),
      'syncedAt', (select max(synced_at) from scoped),
      'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
    ) into v_result;
  end if;
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_ai_chat_coverage(p_dataset text, p_client text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if p_dataset = 'pick' then
    select jsonb_build_object(
      'dataset',p_dataset,'client',p_client,'dateFrom',min(t.report_date),
      'dataAsOf',max(t.report_date),'syncedAt',max(t.synced_at),'rowCount',count(*))
    into v_result from chat_data_private.metric_rows('p1st',p_client,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date-90,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date) t;
  elsif p_dataset = 'deli' then
    select jsonb_build_object(
      'dataset',p_dataset,'client',p_client,'dateFrom',min(t.report_date),
      'dataAsOf',max(t.report_date),'syncedAt',max(t.synced_at),'rowCount',count(*))
    into v_result from chat_data_private.metric_rows('d1st',p_client,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date-90,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date) t;
  elsif p_dataset = 'ca1' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', null,
      'dateFrom', min(nullif(to_jsonb(t)->>'ngay', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'ngay', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*),
      'note', 'Nguồn Ca 1 không có chiều client.'
    ) into v_result from public.kas_ca1_data t;
  elsif p_dataset = 'leadtime' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', p_client,
      'dateFrom', min(nullif(to_jsonb(t)->>'report_date', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'report_date', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*)
    ) into v_result from public.kas_leadtime_data t
    where p_client = 'ALL' or upper(coalesce(to_jsonb(t)->>'client_name', '')) = p_client;
  else
    raise exception 'AI_CHAT_DATASET_NOT_ALLOWED' using errcode = '22023';
  end if;
  return v_result;
end;
$function$
;
