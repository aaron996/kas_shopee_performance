-- KAS-317: đọc bảng chi tiết cho chatbot và MCP. Cộng số đếm trong khoảng ngày [date_from, date_to], giữ lại
-- hub (để app chuẩn hoá vùng KHL/CK/GXT như các nguồn khác) và, nếu yêu cầu, province và/hoặc lane.
-- Lọc theo client, provinces, lanes (rỗng hoặc null = không lọc). Không có benchmark. Kết quả là một jsonb
-- (cols + rows dạng mảng), tối đa 20.000 dòng sau khi gộp; vượt thì báo lỗi để người gọi thu hẹp phạm vi.
-- Lane chỉ có ở deli và fd. Chỉ cho người dùng đã đăng nhập hoặc service_role (MCP).
create or replace function public.get_kas_detail_summary(
  dataset text, date_from date, date_to date, client text default null,
  provinces text[] default null, lanes text[] default null,
  by_province boolean default false, by_lane boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  data_rows jsonb; col_list jsonb; latest date; synced timestamptz; n integer;
  use_c boolean := client is not null and client <> 'ALL';
  use_p boolean := coalesce(cardinality(provinces), 0) > 0;
  use_l boolean := coalesce(cardinality(lanes), 0) > 0;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if date_from is null or date_to is null or date_from > date_to or date_to - date_from > 90 then
    raise exception 'AI_CHAT_DETAIL_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;
  if dataset not in ('pick', 'deli', 'fd', 'reverse') then
    raise exception 'Unsupported dataset: %', dataset using errcode = '22023';
  end if;
  if by_lane and dataset not in ('deli', 'fd') then
    raise exception 'AI_CHAT_DETAIL_LANE_NOT_AVAILABLE' using errcode = '22023';
  end if;
  case dataset
    when 'pick' then
      col_list := '["region","hub","hub_type","client_name","province","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      with g as (
        select region, hub, hub_type, client_name, case when by_province then province end as province,
          sum(mau_pu) mau_pu, sum(ontime_pu_1st) ontime_pu_1st, sum(ontime_pu_opr) ontime_pu_opr,
          max(report_date) d, max(synced_at) s
        from public.kas_pick_detail
        where report_date between date_from and date_to and (not use_c or client_name = client)
          and (not use_p or province = any(provinces))
        group by 1, 2, 3, 4, 5 limit 20001)
      select count(*), max(d), max(s), coalesce(jsonb_agg(jsonb_build_array(region, hub, hub_type, client_name, province,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb) into n, latest, synced, data_rows from g;
    when 'deli' then
      col_list := '["region","wh_id","hub","hub_type","client_name","province","lane","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      with g as (
        select region, wh_id, hub, hub_type, client_name, case when by_province then province end as province,
          case when by_lane then lane end as lane,
          sum(mau_deli) mau_deli, sum(ontime_deli_1st) ontime_deli_1st, sum(ontime_deli_odr) ontime_deli_odr,
          max(report_date) d, max(synced_at) s
        from public.kas_deli_detail
        where report_date between date_from and date_to and (not use_c or client_name = client)
          and (not use_p or province = any(provinces)) and (not use_l or lane = any(lanes))
        group by 1, 2, 3, 4, 5, 6, 7 limit 20001)
      select count(*), max(d), max(s), coalesce(jsonb_agg(jsonb_build_array(region, wh_id, hub, hub_type, client_name,
          province, lane, mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb) into n, latest, synced, data_rows from g;
    when 'fd' then
      col_list := '["region","wh_id","deliverywh","hub_type","client_name","province","lane","mau_fd","fd_hoan_thanh"]';
      with g as (
        select region, wh_id, deliverywh, hub_type, client_name, case when by_province then province end as province,
          case when by_lane then lane end as lane,
          sum(mau_fd) mau_fd, sum(fd_hoan_thanh) fd_hoan_thanh, max(report_date) d, max(synced_at) s
        from public.kas_fd_detail
        where report_date between date_from and date_to and (not use_c or client_name = client)
          and (not use_p or province = any(provinces)) and (not use_l or lane = any(lanes))
        group by 1, 2, 3, 4, 5, 6, 7 limit 20001)
      select count(*), max(d), max(s), coalesce(jsonb_agg(jsonb_build_array(region, wh_id, deliverywh, hub_type, client_name,
          province, lane, mau_fd, fd_hoan_thanh)), '[]'::jsonb) into n, latest, synced, data_rows from g;
    else
      col_list := '["region","hub","hub_type","client_name","province","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      with g as (
        select region, hub, hub_type, client_name, case when by_province then province end as province,
          sum(mau_pu) mau_pu, sum(ontime_pu_1st) ontime_pu_1st, sum(ontime_pu_opr) ontime_pu_opr,
          max(report_date) d, max(synced_at) s
        from public.kas_reverse_detail
        where report_date between date_from and date_to and (not use_c or client_name = client)
          and (not use_p or province = any(provinces))
        group by 1, 2, 3, 4, 5 limit 20001)
      select count(*), max(d), max(s), coalesce(jsonb_agg(jsonb_build_array(region, hub, hub_type, client_name, province,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb) into n, latest, synced, data_rows from g;
  end case;
  if n > 20000 then
    raise exception 'AI_CHAT_DETAIL_TOO_LARGE' using errcode = '22023';
  end if;
  return jsonb_build_object('dataset', dataset, 'date_from', date_from, 'date_to', date_to,
    'dataAsOf', latest, 'syncedAt', synced, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_detail_summary(text, date, date, text, text[], text[], boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.get_kas_detail_summary(text, date, date, text, text[], text[], boolean, boolean)
  to authenticated, service_role;
