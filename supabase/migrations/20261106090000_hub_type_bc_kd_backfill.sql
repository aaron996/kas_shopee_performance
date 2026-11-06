-- Gắn nhãn hub_type = 'BC KD' cho dòng đã có trong bảng (datajob quên CASE này).
-- Dòng mới được gắn ở Apps Script (opsHubTypeBcKd_), cùng quy tắc với CASE của datajob:
--   TRIM(tên kho) khớp '^\([^)]*\) (KD|KT) .*', và không phải Ahamove / Giao Hàng Nặng / Key Account.
-- Phải chạy TRƯỚC khi dán bản Apps Script mới. Khoá của bảng history có hub_type, nên nếu script mới
-- upsert trước, mỗi hub KD/KT sẽ có thêm một dòng "BC KD" bên cạnh dòng "BC" cũ và số liệu bị nhân đôi.
-- Không dùng trigger: sync_ops_kpi_delta so hash dòng nguồn với dòng trong bảng, trigger làm hai bên lệch.
-- Chạy lại an toàn: dòng đã là 'BC KD' không còn khớp điều kiện "is distinct from".
do $$
declare
  spec record;
  n bigint;
begin
  for spec in
    select * from (values
      ('kas_pick_data','hub'), ('kas_deli_data','hub'), ('kas_fd_data','deliverywh'),
      ('kas_pick_history','hub'), ('kas_deli_history','hub'), ('kas_fd_history','deliverywh'),
      ('kas_reverse_history','hub')
    ) v(tbl, name_col)
  loop
    execute format($q$
      update public.%I set hub_type = 'BC KD'
      where btrim(%I) ~ '^\([^)]*\) (KD|KT) '
        and btrim(%I) !~ 'Ahamove|Kho Giao Hàng Nặng|Key Account Warehouse'
        and hub_type is distinct from 'BC KD'
    $q$, spec.tbl, spec.name_col, spec.name_col);
    get diagnostics n = row_count;
    raise notice '% : % dòng -> BC KD', spec.tbl, n;
    -- Dashboard đọc biên max(id), synced_at (xem sync_ops_kpi_delta): đẩy biên khi có thay đổi.
    if n > 0 and spec.tbl in ('kas_pick_data','kas_deli_data','kas_fd_data') then
      execute format('update public.%I set synced_at = clock_timestamp() where id = (select max(id) from public.%I)',
        spec.tbl, spec.tbl);
    end if;
  end loop;
end $$;
