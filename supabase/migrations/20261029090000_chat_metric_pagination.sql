-- Migration: get_ai_chat_metric gains p_offset, and returns totalEntities so a
-- caller can tell whether a region/hub breakdown was truncated.
--
-- The original design just hard-capped p_limit at 50 (server/chat/tools.js,
-- SQL check below) with no documented reason beyond "a round number that's
-- plenty for the chat table" (docs/chat-inline-charts.md: "bảng giữ tối đa 50
-- nhóm đã được RPC trả về"). With more than 50 distinct entities under a
-- grain (e.g. hub-level detail for a busy vùng), the caller had no way to
-- fetch the rest and no signal that rows were missing beyond manually
-- comparing volumes. p_offset lets a caller page through in `limit`-sized
-- steps; `totalEntities` (the count before limit/offset) tells it when to
-- stop. p_offset defaults to 0 so any existing caller that omits it is
-- unaffected.
create or replace function public.get_ai_chat_metric(
  p_metric text, p_client text, p_date_from date, p_date_to date, p_grain text,
  p_regions text[], p_hub_types text[], p_limit integer, p_sort text,
  p_offset integer default 0)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_result jsonb;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to
     or p_date_to-p_date_from > 90 or p_metric is null or p_grain is null or p_sort is null or p_limit is null
     or p_metric not in ('p1st', 'opr', 'd1st', 'odr')
     or p_grain not in ('nationwide', 'region', 'hub')
     or p_sort not in ('worst', 'best', 'volume_desc')
     or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception 'AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;

  with raw as materialized (
    select * from chat_data_private.metric_rows(p_metric,p_client,p_date_from,p_date_to)
  ), locations as materialized (
    select distinct hub, raw_region, raw_hub_type from raw
  ), normalized as materialized (
    select hub, raw_region, raw_hub_type,
      case
        when lower(btrim(hub)) = 'key account warehouse ho chi minh' then 'HCM - KA'
        when lower(btrim(hub)) = '(hno) lh long biên' then 'HNO - KA'
        when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HCM' then 'HCM - KA'
        when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HNO' then 'HNO - KA'
        when upper(raw_hub_type) <> 'KA' and strpos(hub, 'CK') > 0 and upper(raw_region) = 'HCM' then 'HCM - CK'
        when upper(raw_hub_type) <> 'KA' and strpos(hub, 'CK') > 0 and upper(raw_region) = 'HNO' then 'HNO - CK'
        when upper(btrim(raw_hub_type)) = 'GXT' then coalesce(public.gxt_mien_region(hub, raw_region), raw_region)
        else raw_region
      end as region,
      case
        when lower(btrim(hub)) = '(hno) lh long biên' then 'KA'
        when upper(raw_hub_type) <> 'KA' and strpos(hub, 'CK') > 0 then 'CK'
        else raw_hub_type
      end as hub_type
    from locations
  ), scoped as materialized (
    select r.report_date, r.synced_at, r.denominator, r.numerator,
      case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then n.region else r.hub end as entity
    from raw r join normalized n using (hub, raw_region, raw_hub_type)
    where (coalesce(array_length(p_regions, 1), 0) = 0 or n.region = any(p_regions))
      and (coalesce(array_length(p_hub_types, 1), 0) = 0 or n.hub_type = any(p_hub_types))
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
      entity asc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'metric', p_metric,
    'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
    'dataAsOf', (select max(report_date) from scoped),
    'syncedAt', (select max(synced_at) from scoped),
    'totalEntities', (select count(*) from grouped),
    'offset', p_offset,
    'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- A new parameter list is a distinct Postgres overload, not a replacement of
-- the previous 9-arg signature: drop the old one so nothing keeps calling the
-- pre-pagination copy, and re-grant on the new signature since a new overload
-- does not inherit the old one's ACL. No RLS policies, role timeouts or KPI
-- business rules are changed.
drop function if exists public.get_ai_chat_metric(text, text, date, date, text, text[], text[], integer, text);
revoke all on function public.get_ai_chat_metric(text, text, date, date, text, text[], text[], integer, text, integer) from public, anon;
grant execute on function public.get_ai_chat_metric(text, text, date, date, text, text[], text[], integer, text, integer) to authenticated;
