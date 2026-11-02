-- Reverse: new keys are inserted, existing keys receive corrected source values.
-- Rows absent from the sheet are retained. No reporting window is deleted.
create or replace function public.upsert_kas_reverse_history(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare
  total_n integer; distinct_n integer; written_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then
    raise exception 'Batch too large: % rows (max 20000)', total_n;
  end if;
  -- Do not allow an old writer to erase PUD samples already supplied.
  if exists (select 1 from jsonb_array_elements(rows) item where not (item ? 'mau_pud'))
      and exists (select 1 from public.kas_reverse_history
        where report_date between date_from and date_to and mau_pud is not null) then
    raise exception 'Missing mau_pud: update reverse-history-sync.gs before syncing';
  end if;
  create temporary table reverse_history_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name,
    r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr, r.pud, r.mau_pud
  from jsonb_populate_recordset(null::public.kas_reverse_history, rows) r;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  if exists (select 1 from pg_temp.reverse_history_incoming
      where mau_pud < 0 or pud < 0 or pud > mau_pud
        or mau_pud::text in ('NaN', 'Infinity', '-Infinity')
        or pud::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Invalid PUD counts: require 0 <= pud <= mau_pud';
  end if;
  select count(*) into distinct_n from (select 1 from pg_temp.reverse_history_incoming
    group by report_date, region, hub, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  insert into public.kas_reverse_history as target
    (report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud)
  select report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud
  from pg_temp.reverse_history_incoming
  on conflict on constraint kas_reverse_history_key do update set
    mau_pu = excluded.mau_pu,
    ontime_pu_1st = excluded.ontime_pu_1st,
    ontime_pu_opr = excluded.ontime_pu_opr,
    pud = excluded.pud,
    mau_pud = excluded.mau_pud,
    synced_at = now()
  where (target.mau_pu, target.ontime_pu_1st, target.ontime_pu_opr, target.pud, target.mau_pud)
    is distinct from (excluded.mau_pu, excluded.ontime_pu_1st, excluded.ontime_pu_opr, excluded.pud, excluded.mau_pud);
  get diagnostics written_n = row_count;
  drop table pg_temp.reverse_history_incoming;
  return jsonb_build_object('rows', total_n, 'written', written_n, 'unchanged', total_n - written_n, 'deleted', 0);
end $$;
revoke all on function public.upsert_kas_reverse_history(date, date, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_kas_reverse_history(date, date, jsonb) to service_role;

-- Compatibility for older script callers: the old name now upserts too.
create or replace function public.replace_kas_reverse_history(date_from date, date_to date, rows jsonb)
returns jsonb language sql security definer set search_path = '' set statement_timeout = '2min' as $$
  select public.upsert_kas_reverse_history(date_from, date_to, rows);
$$;
revoke all on function public.replace_kas_reverse_history(date, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_kas_reverse_history(date, date, jsonb) to service_role;
