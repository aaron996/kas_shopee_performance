-- Backlog L14D của SPE Reverse (client 224845): ảnh chụp mỗi ngày, đếm đơn ready_to_pick chưa lấy thành công trong cửa sổ
-- 14 ngày hẹn lấy, chia theo số lần gán (assign_bucket) và tuổi tồn (age_bucket). Nguồn: tab reverse_backlog của sheet OPS,
-- một ngày snapshot mỗi lần BI đổ. Mỗi ngày snapshot là một ảnh đầy đủ nên ghi lại là thay cả ngày đó; các ngày khác giữ nguyên
-- để có snapshot tuần trước so sánh. Dòng không xuất hiện trong nguồn nghĩa là 0 đơn của tổ hợp đó.
create table if not exists public.kas_reverse_backlog (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  client_name text not null,
  region text,
  hub_type text,
  assign_bucket text not null check (assign_bucket in ('0', '1-2', '3+')),
  age_bucket text not null check (age_bucket in ('1-3', '4-7', '8-14')),
  backlog_orders numeric not null check (backlog_orders >= 0),
  synced_at timestamptz not null default now(),
  constraint kas_reverse_backlog_key unique nulls not distinct (snapshot_date, client_name, region, hub_type, assign_bucket, age_bucket)
);

alter table public.kas_reverse_backlog enable row level security;
revoke all on public.kas_reverse_backlog from public, anon, authenticated;
grant select, insert, update, delete on public.kas_reverse_backlog to service_role;

-- Thay toàn bộ dòng của từng snapshot_date có trong rows (xoá rồi chèn trong cùng giao dịch). Rows không được rỗng, tối đa 5.000
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
  if total_n > 5000 then
    raise exception 'Batch too large: % rows (max 5000)', total_n;
  end if;
  create temporary table reverse_backlog_incoming on commit drop as
  select r.snapshot_date, r.client_name, r.region, r.hub_type, r.assign_bucket, r.age_bucket, r.backlog_orders
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
    group by snapshot_date, client_name, region, hub_type, assign_bucket, age_bucket) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  delete from public.kas_reverse_backlog
  where (snapshot_date, client_name) in (select snapshot_date, client_name from pg_temp.reverse_backlog_incoming);
  get diagnostics deleted_n = row_count;
  insert into public.kas_reverse_backlog (snapshot_date, client_name, region, hub_type, assign_bucket, age_bucket, backlog_orders)
  select snapshot_date, client_name, region, hub_type, assign_bucket, age_bucket, backlog_orders
  from pg_temp.reverse_backlog_incoming;
  get diagnostics inserted_n = row_count;
  drop table pg_temp.reverse_backlog_incoming;
  return jsonb_build_object('rows', total_n, 'deleted', deleted_n, 'inserted', inserted_n);
end $$;

revoke all on function public.upsert_kas_reverse_backlog(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_kas_reverse_backlog(jsonb) to service_role;

-- Đọc cho app: snapshot mới nhất và snapshot gần nhất cách đó ít nhất 7 ngày (để so sánh tuần trước). Bảng chỉ service_role đọc
-- được nên frontend đi qua RPC security definer này. Trả về mảng gọn theo thứ tự cols; prev_* là null nếu chưa có snapshot cũ.
create or replace function public.get_kas_reverse_backlog(client text default 'SPE Reverse', prev_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '15s' as $$
declare
  latest date; prev date; cur_rows jsonb; prev_rows jsonb;
begin
  if prev_days is null or prev_days < 1 or prev_days > 60 then
    raise exception 'prev_days must be between 1 and 60';
  end if;
  select max(snapshot_date) into latest from public.kas_reverse_backlog where client_name = client;
  if latest is null then
    return jsonb_build_object('snapshot_date', null, 'prev_snapshot_date', null,
      'cols', '["region","hub_type","assign_bucket","age_bucket","backlog_orders"]'::jsonb,
      'rows', '[]'::jsonb, 'prev_rows', '[]'::jsonb);
  end if;
  select max(snapshot_date) into prev from public.kas_reverse_backlog
    where client_name = client and snapshot_date <= latest - prev_days;
  select coalesce(jsonb_agg(jsonb_build_array(region, hub_type, assign_bucket, age_bucket, backlog_orders)), '[]'::jsonb)
    into cur_rows from public.kas_reverse_backlog where client_name = client and snapshot_date = latest;
  select coalesce(jsonb_agg(jsonb_build_array(region, hub_type, assign_bucket, age_bucket, backlog_orders)), '[]'::jsonb)
    into prev_rows from public.kas_reverse_backlog where client_name = client and snapshot_date = prev;
  return jsonb_build_object('snapshot_date', latest::text, 'prev_snapshot_date', prev::text,
    'cols', '["region","hub_type","assign_bucket","age_bucket","backlog_orders"]'::jsonb,
    'rows', cur_rows, 'prev_rows', prev_rows);
end $$;

revoke all on function public.get_kas_reverse_backlog(text, integer) from public, anon, authenticated;
grant execute on function public.get_kas_reverse_backlog(text, integer) to authenticated, service_role;
