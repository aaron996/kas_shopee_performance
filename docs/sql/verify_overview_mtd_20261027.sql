begin;
-- SQL Editor/admin verification only; transaction-local claims, no user session changes.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
with payloads as materialized (
  select public.get_kas_daily_range_compact('pick',date '2026-10-01',date '2026-10-26') as old,
    public.get_kas_mtd_compact('pick',date '2026-10-01',date '2026-10-26') as new
), daily_sums as (
  select jsonb_build_array(r->1,r->2,r->3,r->4) as dimensions,sum((r->>5)::numeric) as m0,sum((r->>6)::numeric) as m1,sum((r->>7)::numeric) as m2
  from payloads,jsonb_array_elements(old->'rows') r group by 1
), mtd_sums as (
  select jsonb_build_array(r->0,r->1,r->2,r->3) as dimensions,(r->>4)::numeric as m0,(r->>5)::numeric as m1,(r->>6)::numeric as m2
  from payloads,jsonb_array_elements(new->'rows') r
), differences as (
  (select * from daily_sums except select * from mtd_sums)
  union all (select * from mtd_sums except select * from daily_sums)
)
select 'pick' as dataset,jsonb_array_length(old->'rows') as old_rows,
  jsonb_array_length(new->'rows') as new_rows,octet_length(old::text) as old_json_bytes,
  octet_length(new::text) as new_json_bytes,(select count(*) from differences) as mismatched_groups
from payloads;
rollback;

begin;
-- SQL Editor/admin verification only; transaction-local claims, no user session changes.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
with payloads as materialized (
  select public.get_kas_daily_range_compact('deli',date '2026-10-01',date '2026-10-26') as old,
    public.get_kas_mtd_compact('deli',date '2026-10-01',date '2026-10-26') as new
), daily_sums as (
  select jsonb_build_array(r->1,r->2,r->3,r->4,r->5) as dimensions,sum((r->>6)::numeric) as m0,sum((r->>7)::numeric) as m1,sum((r->>8)::numeric) as m2
  from payloads,jsonb_array_elements(old->'rows') r group by 1
), mtd_sums as (
  select jsonb_build_array(r->0,r->1,r->2,r->3,r->4) as dimensions,(r->>5)::numeric as m0,(r->>6)::numeric as m1,(r->>7)::numeric as m2
  from payloads,jsonb_array_elements(new->'rows') r
), differences as (
  (select * from daily_sums except select * from mtd_sums)
  union all (select * from mtd_sums except select * from daily_sums)
)
select 'deli' as dataset,jsonb_array_length(old->'rows') as old_rows,
  jsonb_array_length(new->'rows') as new_rows,octet_length(old::text) as old_json_bytes,
  octet_length(new::text) as new_json_bytes,(select count(*) from differences) as mismatched_groups
from payloads;
rollback;

begin;
-- SQL Editor/admin verification only; transaction-local claims, no user session changes.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
with payloads as materialized (
  select public.get_kas_daily_range_compact('fd',date '2026-10-01',date '2026-10-19') as old,
    public.get_kas_mtd_compact('fd',date '2026-10-01',date '2026-10-19') as new
), daily_sums as (
  select jsonb_build_array(r->1,r->2,r->3,r->4,r->5) as dimensions,sum((r->>6)::numeric) as m0,sum((r->>7)::numeric) as m1
  from payloads,jsonb_array_elements(old->'rows') r group by 1
), mtd_sums as (
  select jsonb_build_array(r->0,r->1,r->2,r->3,r->4) as dimensions,(r->>5)::numeric as m0,(r->>6)::numeric as m1
  from payloads,jsonb_array_elements(new->'rows') r
), differences as (
  (select * from daily_sums except select * from mtd_sums)
  union all (select * from mtd_sums except select * from daily_sums)
)
select 'fd' as dataset,jsonb_array_length(old->'rows') as old_rows,
  jsonb_array_length(new->'rows') as new_rows,octet_length(old::text) as old_json_bytes,
  octet_length(new::text) as new_json_bytes,(select count(*) from differences) as mismatched_groups
from payloads;
rollback;

