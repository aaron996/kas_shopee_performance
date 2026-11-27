-- Nâng giới hạn một lần ghi backlog Reverse từ 5.000 lên 10.000 dòng: thêm wh_id vào khoá làm snapshot ~3.800 dòng (trước đó ~180).
-- Chỉ đổi ngưỡng; giữ nguyên các kiểm tra khác (tối đa 3 ngày snapshot, khoá trùng, giá trị sai) và quyền thực thi.
-- Thay toàn bộ dòng của từng snapshot_date có trong rows (xoá rồi chèn trong cùng giao dịch). Rows không được rỗng, tối đa 10.000
-- dòng và 3 ngày snapshot mỗi lần (tránh một nguồn lỗi xoá nhiều ngày), khoá trùng hoặc giá trị sai là lỗi và không ghi gì.
create or replace function public.upsert_kas_reverse_backlog(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '1min' as $$
declare
  total_n integer; distinct_n integer; days_n integer; deleted_n integer; inserted_n integer;
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 10000 then
    raise exception 'Batch too large: % rows (max 10000)', total_n;
  end if;
  create temporary table reverse_backlog_incoming on commit drop as
  select r.snapshot_date, r.client_name, r.region, r.hub_type, r.wh_id, r.assign_bucket, r.age_bucket, r.backlog_orders
  from jsonb_populate_recordset(null::public.kas_reverse_backlog, rows) r;
  if exists (select 1 from pg_temp.reverse_backlog_incoming
      where snapshot_date is null or client_name is null or assign_bucket is null or age_bucket is null or backlog_orders is null) then
    raise exception 'Row with missing snapshot_date, client_name, assign_bucket, age_bucket or backlog_orders';
  end if;
  if exists (select 1 from pg_temp.reverse_backlog_incoming
      where backlog_orders::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Invalid backlog_orders';
  end if;
  select count(distinct snapshot_date) into days_n from pg_temp.reverse_backlog_incoming;
  if days_n > 3 then
    raise exception 'Too many snapshot dates: % (max 3)', days_n;
  end if;
  select count(*) into distinct_n from (
    select 1 from pg_temp.reverse_backlog_incoming
    group by snapshot_date, client_name, region, hub_type, wh_id, assign_bucket, age_bucket) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  delete from public.kas_reverse_backlog
  where (snapshot_date, client_name) in (select snapshot_date, client_name from pg_temp.reverse_backlog_incoming);
  get diagnostics deleted_n = row_count;
  insert into public.kas_reverse_backlog (snapshot_date, client_name, region, hub_type, wh_id, assign_bucket, age_bucket, backlog_orders)
  select snapshot_date, client_name, region, hub_type, wh_id, assign_bucket, age_bucket, backlog_orders
  from pg_temp.reverse_backlog_incoming;
  get diagnostics inserted_n = row_count;
  drop table pg_temp.reverse_backlog_incoming;
  return jsonb_build_object('rows', total_n, 'deleted', deleted_n, 'inserted', inserted_n);
end $$;

revoke all on function public.upsert_kas_reverse_backlog(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_kas_reverse_backlog(jsonb) to service_role;

