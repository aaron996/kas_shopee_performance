-- Đọc hub-ngày từ bảng lịch sử theo khoảng ngày do người dùng chọn ("Theo ngày" > lọc khoảng ngày
-- của Chi tiết Vùng/Hub). Khác kas_*_data (cửa sổ cố định D-14..D-1, có cột benchmark), bảng lịch
-- sử giữ ~90 ngày và không có benchmark, nên chế độ này không có WTD / tốt nhất 6 tuần / cùng ngày
-- tháng trước. Cùng định dạng gọn với get_kas_weekly_compact: mỗi dòng là một mảng theo thứ tự `cols`.
-- Khoảng tối đa 92 ngày (đủ phủ retention 90 ngày) để một lần gọi không vượt statement timeout.
create or replace function public.get_kas_daily_range_compact(dataset text, date_from date, date_to date)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  date_list jsonb; data_rows jsonb; col_list jsonb;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'invalid date range';
  end if;
  if date_to - date_from > 91 then
    raise exception 'date range must not exceed 92 days';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_pick_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_pick_history where report_date between date_from and date_to) s;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb)
        into data_rows from public.kas_deli_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_deli_history where report_date between date_from and date_to) s;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh)), '[]'::jsonb)
        into data_rows from public.kas_fd_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_fd_history where report_date between date_from and date_to) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', date_list, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_daily_range_compact(text, date, date) from public, anon, authenticated;
grant execute on function public.get_kas_daily_range_compact(text, date, date) to authenticated, service_role;
