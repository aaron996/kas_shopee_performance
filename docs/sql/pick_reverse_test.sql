-- KAS-291: SPE Reverse (client_id 224845) - 1st OPR / OTS / PUD theo BC-ngày. Nguồn: query tham khảo của Thịnh,
-- chạy StarRocks (sr_ghn_reporting). Khác bản Trino của Thịnh: bỏ CAST(.. AS VARCHAR) và dùng parse_json(warehouse_log)
-- trong UNNEST. Dtm_KA_Shopee không nhân dòng theo LoadDate với đơn Reverse (đã kiểm: COUNT = COUNT DISTINCT).
-- Ngày hẹn lấy (loaddate_final): tạo đơn trước 16h = D0, từ 16h = D+1, không sớm hơn LoadDate.
-- 1st OPR dùng first_valid_pickup_time (đã loại lần đi lấy "Nhân viên gặp sự cố"), fallback endpicktime.
-- DropAtStation: nếu khách ra BC khác BC được gán đầu tiên thì tính cho BC được gán đầu tiên (pickwh_final).
-- Test 01/10 -> 14/10/2026: total_vol 74.743, first_pick_ontime 47.088, pickup_ontime 23.771, PUD 47.772,
-- 1.944 đơn đổi BC. Đổi khoảng ngày ở dòng WHERE loaddate_final BETWEEN.
WITH shopee_biz_type AS (
    SELECT order_code
    FROM default_catalog.sr_clean.online_core__shipping_order__created_date
    WHERE dt >= '2026-08-01'
      AND client_id = 224845
      AND (get_json_int(data, '$.shopee_business_type') = 1
        OR get_json_int(data, '$.shopee_business_type') IS NULL)
),
b2 AS (
    SELECT ordercode,
           MAX(canceltime)     AS canceltime,
           MIN(createddate)    AS createddate,
           MAX(actualpicktype) AS actualpicktype
    FROM sr_ghn_reporting.ka.Dtm_KA_V3_CreatedDate
    WHERE clientid = 224845
    GROUP BY ordercode
),
b3 AS (
    SELECT a.ordercode, a.currentstatus, a.endpicktime, a.first_valid_pickup_time, a.pickwh,
           a.fromregion_new, a.fromprovince_new, a.fromward_new,
           b2.canceltime, b2.actualpicktype,
           GREATEST(
               DATE(a.loaddate),
               CASE WHEN HOUR(b2.createddate) < 16 THEN DATE(b2.createddate)
                    ELSE DATE(b2.createddate) + INTERVAL '1' DAY END
           ) AS loaddate_final
    FROM sr_ghn_reporting.ka.Dtm_KA_Shopee a
    INNER JOIN b2 ON a.ordercode = b2.ordercode
    WHERE a.loaddate >= '2025-08-01'
      AND a.ordercode IN (SELECT order_code FROM shopee_biz_type)
),
bc_first AS (
    SELECT o.order_code,
           o.pick_warehouse_id AS bc_dropoff_id,
           ELEMENT_AT(ARRAY_AGG(get_json_int(t.it, '$.pick_warehouse_id')
                                ORDER BY get_json_string(t.it, '$.updated_date') ASC), 1) AS bc_first_id
    FROM default_catalog.sr_clean.online_core__shipping_order__end_pick_time o
    CROSS JOIN UNNEST(CAST(parse_json(o.warehouse_log) AS ARRAY<JSON>)) AS t(it)
    WHERE o.dt >= DATE '2026-08-01'
      AND o.client_id = 224845
      AND o.order_code IN (SELECT ordercode FROM b3 WHERE actualpicktype = 'DropAtStation')
    GROUP BY o.order_code, o.pick_warehouse_id
),
b4 AS (
    SELECT b3.*,
           CASE WHEN b3.actualpicktype = 'DropAtStation'
                 AND m.bc_first_id <> m.bc_dropoff_id
                 AND w.warehouse_name IS NOT NULL
                THEN w.warehouse_name ELSE b3.pickwh END AS pickwh_final
    FROM b3
    LEFT JOIN bc_first m ON m.order_code = b3.ordercode
    LEFT JOIN default_catalog.sr_dim.dim_warehouse w ON w.warehouse_id = m.bc_first_id
)
SELECT
    fromprovince_new,
    fromward_new,
    pickwh_final AS pickwh,
    CASE
        WHEN pickwh_final LIKE '%Ahamove%'               THEN 'AHM'
        WHEN pickwh_final LIKE '%Kho Giao Hàng Nặng%'    THEN 'GXT'
        WHEN pickwh_final LIKE '%Key Account Warehouse%' THEN 'KHL'
        WHEN pickwh_final LIKE '%KD%'                    THEN 'BC KD'
        ELSE 'BC'
    END AS partner,
    date_format(loaddate_final, '%Y-%v')    AS isoweek,
    date_format(loaddate_final, '%Y-%m-%d') AS loaddate,
    CASE WHEN fromregion_new = 'ĐCL' THEN 'DCL' ELSE fromregion_new END AS fromregion,
    SUM(CASE WHEN DATE(COALESCE(first_valid_pickup_time, endpicktime)) <= loaddate_final THEN 1 ELSE 0 END) AS first_pick_ontime,
    SUM(CASE WHEN DATE(endpicktime) <= loaddate_final THEN 1 ELSE 0 END) AS pickup_ontime,
    SUM(CASE WHEN endpicktime IS NOT NULL THEN 1 ELSE 0 END) AS PUD,
    COUNT(*) AS total_vol
FROM b4
WHERE loaddate_final BETWEEN DATE '2026-10-01' AND DATE '2026-10-14'
  AND NOT (currentstatus = 'cancel' AND DATE(canceltime) <= loaddate_final)
GROUP BY 1, 2, 3, 4, 5, 6, 7
ORDER BY 5, 6, 7, 4
