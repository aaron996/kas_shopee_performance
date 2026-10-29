-- Migration: get_ai_chat_metric gains the CK hub/vùng logic the dashboard
-- already has (src/utils/dataProcessor.js isCkHub / reassignKaRegion), closing
-- the gap tracked in docs/tech-debt.md "2. RPC chat chưa có logic CK".
--
-- Without this, a CK hub in vùng HCM/HNO stays counted under the plain
-- "HCM"/"HNO" region in chat/MCP answers, while the dashboard already reports
-- it separately as "HCM - CK"/"HNO - CK" — inflating the chat/MCP "HCM"
-- number relative to the dashboard's "HCM" row by exactly the CK volume.
--
-- CK detection here only covers the hub-name rule (hub contains "CK",
-- case-sensitive — matching isCkHub's `name.includes('CK')`), not the
-- dataProcessor.js `wh_id` allowlist fallback: chat_data_private.metric_rows
-- does not expose a warehouse id column, so a CK hub whose name doesn't
-- literally contain "CK" cannot be detected here. Keep the two in sync by
-- name only; see docs/tech-debt.md for the remaining gap.
--
-- Priority matches reassignKaRegion exactly: KA wins over CK (a KA warehouse
-- is never re-typed as CK), and CK runs before the GXT reassignment (only a
-- row still typed GXT after this reaches gxt_mien_region). A CK hub outside
-- HCM/HNO keeps its region but still gets hub_type 'CK', so hub-type
-- filtering ("CK") still finds it.
create or replace function public.get_ai_chat_metric(
  p_metric text, p_client text, p_date_from date, p_date_to date, p_grain text,
  p_regions text[], p_hub_types text[], p_limit integer, p_sort text)
returns jsonb language plpgsql stable set search_path = '' as $$
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
      entity asc limit p_limit
  )
  select jsonb_build_object(
    'metric', p_metric,
    'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
    'dataAsOf', (select max(report_date) from scoped),
    'syncedAt', (select max(synced_at) from scoped),
    'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- CREATE OR REPLACE preserves the existing invoker security and ACLs. No table
-- permissions, RLS policies, role timeouts or KPI business rules are changed.
