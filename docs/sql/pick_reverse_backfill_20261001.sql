-- Backfill SPE Reverse (client 224845) cho kas_reverse_history, cùng logic NGÀY HẸN LẤY với pick_reverse_14d.sql (27/11/2026):
-- mau_pu chung cho 1st Pickup/OPR/PUD, pud = đơn trong pool đã lấy tới hết ngày d, mau_pud = COUNT(*) pool (cho tab Backlog).
-- Chỉ khác cửa sổ cố định: 2026-10-01 .. 2026-11-26 (D-1 tại 27/11; sau đó datajob hằng ngày ghi D-14..D-1). Dán kết quả vào tab
-- reverse_backfill_tmp rồi chạy backfillReverseHistory() (xem scripts/apps-script/reverse-history-sync.gs).
WITH ky_bao_cao AS (
    SELECT CAST('2026-10-01' AS DATE) AS win_start, CAST('2026-11-26' AS DATE) AS win_end
),
cal AS (
    SELECT DATE_ADD(k.win_start, INTERVAL (t.n * 10 + u.n) DAY) AS d
    FROM ky_bao_cao k
    CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) t
    CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) u
    WHERE DATE_ADD(k.win_start, INTERVAL (t.n * 10 + u.n) DAY) <= k.win_end
),
biz AS (
    SELECT order_code, MAX(get_json_int(data, '$.shopee_business_type')) AS shopee_business_type
    FROM default_catalog.sr_clean.online_core__shipping_order__created_date
    WHERE client_id = 224845
      AND dt >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '21' DAY
      AND dt <= (SELECT win_end FROM ky_bao_cao) + INTERVAL '2' DAY
    GROUP BY order_code
),
Raw_Order AS (
    SELECT
        A.`OrderCode` AS ordercode, MAX(A.`CurrentStatus`) AS currentstatus, MAX(A.`CancelTime`) AS canceltime,
        MAX(A.`ActualPickType`) AS actualpicktype, MAX(A.`PickWH`) AS pickwh, MAX(A.`PickWarehouseID`) AS pickwh_id,
        MAX(A.`EndPickTime`) AS endpicktime, MIN(A.`CreatedDate`) AS createddate, MAX(A.`OrderDate`) AS orderdate
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate` A
    WHERE A.`ClientID` = 224845
      AND A.`CreatedDate_Partition` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '21' DAY
    GROUP BY A.`OrderCode`
),
shopee AS (
    SELECT `OrderCode` AS ordercode, `LoadDate` AS loaddate, `Fromregion_new` AS fromregion_new,
        `Fromprovince_new` AS fromprovince_new, `Fromward_new` AS fromward_new, `WeightRange` AS weightrange,
        first_valid_pickup_time
    FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee`
    WHERE `LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '24' DAY
      AND `ClientID` LIKE '224845%'
),
b3 AS (
    SELECT R.ordercode, R.currentstatus, R.canceltime, R.actualpicktype, R.pickwh, R.pickwh_id, R.endpicktime,
        S.fromregion_new, S.fromprovince_new, S.fromward_new, S.weightrange, S.first_valid_pickup_time,
        GREATEST(
            COALESCE(DATE(S.loaddate), DATE(R.orderdate)),
            CASE
                WHEN HOUR(R.createddate) < 16 THEN DATE(R.createddate)
                ELSE DATE(R.createddate) + INTERVAL '1' DAY
            END
        ) AS loaddate_final
    FROM Raw_Order R
    LEFT JOIN shopee S ON S.ordercode = R.ordercode
    LEFT JOIN biz C ON C.order_code = R.ordercode
    WHERE (C.shopee_business_type = 1 OR C.shopee_business_type IS NULL)
),
b3f AS (
    SELECT b3.*, DATE(b3.endpicktime) AS pick_date, DATE(b3.canceltime) AS cancel_date,
        CASE WHEN b3.currentstatus = 'cancel' THEN 1 ELSE 0 END AS is_cancel
    FROM b3
    WHERE b3.loaddate_final >= (SELECT win_start FROM ky_bao_cao) - INTERVAL 14 DAY
      AND b3.loaddate_final <= (SELECT win_end FROM ky_bao_cao)
),
bc_first AS (
    SELECT o.order_code, o.pick_warehouse_id AS bc_dropoff_id,
        ELEMENT_AT(ARRAY_AGG(get_json_int(t.it, '$.pick_warehouse_id') ORDER BY get_json_string(t.it, '$.updated_date') ASC), 1) AS bc_first_id
    FROM default_catalog.sr_clean.online_core__shipping_order__end_pick_time o
    CROSS JOIN UNNEST(CAST(parse_json(o.warehouse_log) AS ARRAY<JSON>)) AS t(it)
    WHERE o.client_id = 224845
      AND o.dt >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '21' DAY
      AND o.order_code IN (SELECT ordercode FROM Raw_Order WHERE actualpicktype = 'DropAtStation')
    GROUP BY o.order_code, o.pick_warehouse_id
),
b4 AS (
    SELECT b3f.*,
        TRIM(CASE WHEN b3f.actualpicktype = 'DropAtStation' AND m.bc_first_id <> m.bc_dropoff_id AND w.warehouse_name IS NOT NULL
                  THEN w.warehouse_name ELSE b3f.pickwh END) AS pickwh_final,
        CASE WHEN b3f.actualpicktype = 'DropAtStation' AND m.bc_first_id <> m.bc_dropoff_id AND w.warehouse_name IS NOT NULL
             THEN m.bc_first_id ELSE b3f.pickwh_id END AS wh_id_final
    FROM b3f
    LEFT JOIN bc_first m ON m.order_code = b3f.ordercode
    LEFT JOIN default_catalog.sr_dim.dim_warehouse w ON w.warehouse_id = m.bc_first_id
),
pool AS (
    SELECT c.d, b4.*,
        CASE WHEN b4.loaddate_final = c.d THEN 1 ELSE 0 END AS is_new,
        CASE WHEN b4.pick_date <= c.d THEN 1 ELSE 0 END AS is_picked,
        CASE WHEN b4.loaddate_final = c.d AND DATE(COALESCE(b4.first_valid_pickup_time, b4.endpicktime)) <= c.d THEN 1 ELSE 0 END AS is_first_ontime
    FROM cal c
    JOIN b4 ON b4.loaddate_final <= c.d AND b4.loaddate_final >= c.d - INTERVAL 14 DAY
        AND (b4.pick_date IS NULL OR b4.pick_date >= c.d OR b4.loaddate_final = c.d)
    WHERE NOT (b4.is_cancel = 1 AND (b4.cancel_date IS NULL OR b4.cancel_date <= c.d)
        AND (b4.loaddate_final = c.d OR b4.pick_date IS NULL OR b4.pick_date > c.d))
)
SELECT /*+ SET_VAR(cbo_cte_reuse_rate=0) */
    d AS report_date,
    CASE WHEN fromregion_new = 'HCM' AND pickwh_final LIKE '%Giao Hàng Nặng%' THEN 'HCM - GXT' ELSE fromregion_new END AS region,
    pickwh_final AS hub,
    CASE
        WHEN pickwh_final LIKE '%Ahamove%' THEN 'Ahamove'
        WHEN pickwh_final LIKE '%Key Account%' OR pickwh_final LIKE '%(HNO) LH Long Biên%' THEN 'KA'
        WHEN pickwh_final LIKE '%Giao Hàng Nặng%' THEN 'GXT'
        ELSE 'BC'
    END AS hub_type,
    SUM(is_new) AS mau_pu,
    SUM(is_first_ontime) AS ontime_pu_1st,
    SUM(is_picked * is_new) AS ontime_pu_opr,
    SUM(is_picked) AS pud,
    'SPE Reverse' AS client_name,
    COUNT(*) AS mau_pud,
    wh_id_final AS wh_id,
    fromprovince_new AS province
FROM pool
GROUP BY 1, 2, 3, 4, 11, 12
ORDER BY report_date DESC, region, hub, wh_id
