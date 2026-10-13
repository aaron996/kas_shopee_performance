-- Bản gọn của get_kas_weekly_rows: mỗi dòng là một mảng theo thứ tự `cols` thay vì đối tượng lặp tên cột.
-- get_kas_weekly_rows trả ~4-5 MB mỗi bảng; trên DB nhỏ, 3 lệnh gọi cùng lúc cạnh tranh với đợt tải
-- dữ liệu của trang và bị statement timeout (57014). Bản gọn nhỏ hơn nhiều và rẻ hơn khi dựng JSON.
-- get_kas_weekly_rows được giữ nguyên để không phá bản frontend cũ đang mở.
create or replace function public.get_kas_weekly_compact(dataset text, weeks integer default 9)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  latest date; first_week date; week_list jsonb; data_rows jsonb; col_list jsonb;
begin
  if weeks is null or weeks < 1 or weeks > 16 then
    raise exception 'weeks must be between 1 and 16';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days"]';
      select max(week_start) into latest from public.kas_pick_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days)), '[]'::jsonb)
        into data_rows from public.kas_pick_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_pick_weekly where week_start >= first_week) s;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr","days"]';
      select max(week_start) into latest from public.kas_deli_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr, days)), '[]'::jsonb)
        into data_rows from public.kas_deli_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_deli_weekly where week_start >= first_week) s;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh","days"]';
      select max(week_start) into latest from public.kas_fd_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh, days)), '[]'::jsonb)
        into data_rows from public.kas_fd_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_fd_weekly where week_start >= first_week) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', week_list, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_weekly_compact(text, integer) from public, anon, authenticated;
grant execute on function public.get_kas_weekly_compact(text, integer) to authenticated, service_role;
