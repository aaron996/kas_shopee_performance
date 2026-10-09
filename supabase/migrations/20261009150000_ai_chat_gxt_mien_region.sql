-- Migration: GXT hubs are reported as one vùng per Miền ("GXT - Bắc" / "GXT - Trung" /
-- "GXT - Nam") in the AI chat metric RPC, matching the dashboard
-- (src/utils/dataProcessor.js reassignGxtMienRegion, src/data/provinceMien.js).
--
-- The raw `region` of a GXT row is the ORDER's vùng, not the hub's (hub
-- "Tân Tạo - HCM" also has rows under DSH, HNO, TTB), so the Miền comes from the
-- province at the end of the hub name; unknown province falls back to the row's
-- region ('HCM - GXT' counts as Miền Nam), and a row with neither keeps its region.
--
-- Without this, the dashboard sends screenContext.regions containing
-- "GXT - Nam" etc. and the RPC (filtering on the raw region) would drop every
-- GXT row from chat answers. Keep the province list below in sync with
-- provinceMien.js (generated from it: normalised key -> vùng).

create or replace function public.gxt_mien_region(p_hub text, p_raw_region text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  with hub as (
    -- Same normalisation as normalizePlaceName(): no accents, đ -> d, lower case,
    -- runs of non-alphanumerics collapsed to one space.
    select btrim(regexp_replace(
      translate(lower(normalize(coalesce(p_hub, ''), NFC)), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
      '[^a-z0-9]+', ' ', 'g')) as name
  ), province(key, vung) as (
    values
      ('ha noi', 'GXT - Bắc'),
      ('hai phong', 'GXT - Bắc'),
      ('quang ninh', 'GXT - Bắc'),
      ('bac giang', 'GXT - Bắc'),
      ('bac ninh', 'GXT - Bắc'),
      ('hai duong', 'GXT - Bắc'),
      ('hung yen', 'GXT - Bắc'),
      ('thai binh', 'GXT - Bắc'),
      ('nam dinh', 'GXT - Bắc'),
      ('ha nam', 'GXT - Bắc'),
      ('ninh binh', 'GXT - Bắc'),
      ('vinh phuc', 'GXT - Bắc'),
      ('phu tho', 'GXT - Bắc'),
      ('thai nguyen', 'GXT - Bắc'),
      ('bac kan', 'GXT - Bắc'),
      ('cao bang', 'GXT - Bắc'),
      ('lang son', 'GXT - Bắc'),
      ('tuyen quang', 'GXT - Bắc'),
      ('ha giang', 'GXT - Bắc'),
      ('lao cai', 'GXT - Bắc'),
      ('yen bai', 'GXT - Bắc'),
      ('dien bien', 'GXT - Bắc'),
      ('lai chau', 'GXT - Bắc'),
      ('son la', 'GXT - Bắc'),
      ('hoa binh', 'GXT - Bắc'),
      ('thanh hoa', 'GXT - Trung'),
      ('nghe an', 'GXT - Trung'),
      ('ha tinh', 'GXT - Trung'),
      ('quang binh', 'GXT - Trung'),
      ('quang tri', 'GXT - Trung'),
      ('thua thien hue', 'GXT - Trung'),
      ('hue', 'GXT - Trung'),
      ('da nang', 'GXT - Trung'),
      ('quang nam', 'GXT - Trung'),
      ('quang ngai', 'GXT - Trung'),
      ('binh dinh', 'GXT - Trung'),
      ('phu yen', 'GXT - Trung'),
      ('khanh hoa', 'GXT - Trung'),
      ('ninh thuan', 'GXT - Trung'),
      ('binh thuan', 'GXT - Trung'),
      ('kon tum', 'GXT - Trung'),
      ('gia lai', 'GXT - Trung'),
      ('dak lak', 'GXT - Trung'),
      ('dak nong', 'GXT - Trung'),
      ('lam dong', 'GXT - Trung'),
      ('ho chi minh', 'GXT - Nam'),
      ('hcm', 'GXT - Nam'),
      ('tp hcm', 'GXT - Nam'),
      ('binh duong', 'GXT - Nam'),
      ('dong nai', 'GXT - Nam'),
      ('ba ria vung tau', 'GXT - Nam'),
      ('vung tau', 'GXT - Nam'),
      ('brvt', 'GXT - Nam'),
      ('tay ninh', 'GXT - Nam'),
      ('binh phuoc', 'GXT - Nam'),
      ('long an', 'GXT - Nam'),
      ('tien giang', 'GXT - Nam'),
      ('ben tre', 'GXT - Nam'),
      ('vinh long', 'GXT - Nam'),
      ('tra vinh', 'GXT - Nam'),
      ('dong thap', 'GXT - Nam'),
      ('an giang', 'GXT - Nam'),
      ('kien giang', 'GXT - Nam'),
      ('can tho', 'GXT - Nam'),
      ('hau giang', 'GXT - Nam'),
      ('soc trang', 'GXT - Nam'),
      ('bac lieu', 'GXT - Nam'),
      ('ca mau', 'GXT - Nam')
  ), by_hub as (
    -- Province at the end of the name, on a word boundary; longest key wins.
    select p.vung
    from hub h join province p on h.name = p.key or h.name like '% ' || p.key
    order by length(p.key) desc
    limit 1
  )
  select coalesce(
    (select vung from by_hub),
    case
      when p_raw_region in ('DBB', 'TBB', 'XBG', 'TNT', 'DSH', 'HNO', 'HNO - KA', 'HNO - CK') then 'GXT - Bắc'
      when p_raw_region in ('BTB', 'TTB', 'TNG', 'NTB') then 'GXT - Trung'
      when p_raw_region in ('DNB', 'HCM', 'HCM - GXT', 'HCM - KA', 'HCM - CK', 'ĐCL', 'TNB') then 'GXT - Nam'
    end
  )
$function$;

create or replace function public.get_ai_chat_metric(p_metric text, p_client text, p_date_from date, p_date_to date, p_grain text, p_regions text[], p_hub_types text[], p_limit integer, p_sort text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_result jsonb;
begin
  if p_metric not in ('p1st', 'opr', 'd1st', 'odr')
     or p_grain not in ('nationwide', 'region', 'hub')
     or p_sort not in ('worst', 'best', 'volume_desc')
     or p_limit not between 1 and 50 then
    raise exception 'AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_metric in ('p1st', 'opr') then
    with raw as (
      select
        nullif(to_jsonb(t)->>'report_date', '')::date as report_date,
        upper(coalesce(to_jsonb(t)->>'client_name', '')) as client_name,
        coalesce(to_jsonb(t)->>'region', 'Không rõ') as raw_region,
        coalesce(to_jsonb(t)->>'hub', to_jsonb(t)->>'hub_name', 'Không rõ') as hub,
        coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', 'Không rõ') as raw_hub_type,
        nullif(regexp_replace(coalesce(to_jsonb(t)->>'mau_pu', ''), '[^0-9.-]', '', 'g'), '')::numeric as denominator,
        nullif(regexp_replace(coalesce(
          case when p_metric = 'p1st' then to_jsonb(t)->>'ontime_pu_1st' else to_jsonb(t)->>'ontime_pu_opr' end, ''
        ), '[^0-9.-]', '', 'g'), '')::numeric as numerator,
        to_jsonb(t)->>'synced_at' as synced_at
      from public.kas_pick_data t
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
      select
        nullif(to_jsonb(t)->>'report_date', '')::date as report_date,
        upper(coalesce(to_jsonb(t)->>'client_name', '')) as client_name,
        coalesce(to_jsonb(t)->>'region', 'Không rõ') as raw_region,
        coalesce(to_jsonb(t)->>'hub', to_jsonb(t)->>'hub_name', 'Không rõ') as hub,
        coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', 'Không rõ') as raw_hub_type,
        nullif(regexp_replace(coalesce(to_jsonb(t)->>'mau_deli', to_jsonb(t)->>'mau_del', ''), '[^0-9.-]', '', 'g'), '')::numeric as denominator,
        nullif(regexp_replace(coalesce(
          case when p_metric = 'd1st'
            then coalesce(to_jsonb(t)->>'ontime_deli_1st', to_jsonb(t)->>'ontime_del_1st')
            else coalesce(to_jsonb(t)->>'ontime_deli_odr', to_jsonb(t)->>'ontime_del_odr') end, ''
        ), '[^0-9.-]', '', 'g'), '')::numeric as numerator,
        to_jsonb(t)->>'synced_at' as synced_at
      from public.kas_deli_data t
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
$function$;
