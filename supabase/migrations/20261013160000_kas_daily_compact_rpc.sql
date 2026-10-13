-- Đọc dòng hub-ngày từ bảng lịch sử (kas_*_history, cùng bảng nguồn của chế độ "Theo tuần") cho hộp thoại
-- Xuất CSV "Theo ngày" khi khoảng ngày dài hơn dữ liệu đang có trong trang (14 ngày).
-- Dạng gọn như get_kas_weekly_compact: mỗi dòng là một mảng theo thứ tự `cols`, tên cột trùng dòng hàng ngày.
-- Mỗi lệnh gọi tối đa 14 ngày (lát 10 ngày ≈ 1,7 MB, 31 ngày ≈ 5,4 MB nên bỏ); frontend chia khoảng dài thành các lát và tải lần lượt.
create or replace function public.get_kas_daily_compact(dataset text, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  data_rows jsonb; col_list jsonb;
begin
  if from_date is null or to_date is null or from_date > to_date then
    raise exception 'from_date must be on or before to_date';
  end if;
  if to_date - from_date > 13 then
    raise exception 'range must be at most 14 days';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_pick_history where report_date between from_date and to_date;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb)
        into data_rows from public.kas_deli_history where report_date between from_date and to_date;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh)), '[]'::jsonb)
        into data_rows from public.kas_fd_history where report_date between from_date and to_date;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_daily_compact(text, date, date) from public, anon, authenticated;
grant execute on function public.get_kas_daily_compact(text, date, date) to authenticated, service_role;
