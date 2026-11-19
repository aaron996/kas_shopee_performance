-- Đồng bộ get_ai_chat_metric với app: loại Hub KA đổi tên KHL (Key Account / khách hàng lớn) và vùng "HCM - KA" / "HNO - KA" đổi tên
-- "HCM - KHL" / "HNO - KHL". Bảng nguồn (kas_pick_history, kas_deli_history) không có wh_id trong metric_rows nên KHL nhận theo tên kho
-- (cùng danh sách với KHL_HUB_NAMES trong src/utils/dataProcessor.js) hoặc nhãn KA/KHL của nguồn. Vùng chỉ đổi cho hai kho Key Account
-- đã có vùng riêng và dòng nhãn KA, giống app; năm kho KHL mới giữ vùng gốc. Bộ lọc cũ 'KA' / 'HCM - KA' / 'HNO - KA' vẫn được hiểu.
-- Không đổi chữ ký hàm nên quyền thực thi giữ nguyên.
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
        when lower(btrim(hub)) = 'key account warehouse ho chi minh' then 'HCM - KHL'
        when lower(btrim(hub)) = '(hno) lh long biên' then 'HNO - KHL'
        when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HCM' then 'HCM - KHL'
        when upper(raw_hub_type) = 'KA' and upper(raw_region) = 'HNO' then 'HNO - KHL'
        when upper(raw_hub_type) <> 'KA' and strpos(hub, 'CK') > 0 and upper(raw_region) = 'HCM' then 'HCM - CK'
        when upper(raw_hub_type) <> 'KA' and strpos(hub, 'CK') > 0 and upper(raw_region) = 'HNO' then 'HNO - CK'
        when upper(btrim(raw_hub_type)) = 'GXT' then coalesce(public.gxt_mien_region(hub, raw_region), raw_region)
        else raw_region
      end as region,
      case
        when lower(normalize(btrim(hub), NFC)) in (
          'key account warehouse ho chi minh', '(hno) lh long biên', '(lan) lh đức lập', '(hcm) lh củ chi',
          '(hcm) đl nhuận đức', '(hcm) đl xuân thới sơn 1', '(hcm) đl bình hưng hòa')
          or upper(btrim(raw_hub_type)) in ('KA', 'KHL') then 'KHL'
        when strpos(hub, 'CK') > 0 then 'CK'
        else raw_hub_type
      end as hub_type
    from locations
  ), scoped as materialized (
    select r.report_date, r.synced_at, r.denominator, r.numerator,
      case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then n.region else r.hub end as entity
    from raw r join normalized n using (hub, raw_region, raw_hub_type)
    where (coalesce(array_length(p_regions, 1), 0) = 0 or n.region = any(array_replace(array_replace(p_regions, 'HCM - KA', 'HCM - KHL'), 'HNO - KA', 'HNO - KHL')))
      and (coalesce(array_length(p_hub_types, 1), 0) = 0 or n.hub_type = any(array_replace(p_hub_types, 'KA', 'KHL')))
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

