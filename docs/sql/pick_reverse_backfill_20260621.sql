-- KAS-291: SPE Reverse backfill một lần từ 21/06/2026 đến hôm qua (cùng thân query với pick_reverse_14d.sql, chỉ khác win_start).
-- Kết quả ghi vào tab reverse_backfill_tmp rồi chạy backfillReverseHistory() (scripts/apps-script/reverse-history-sync.gs).
WITH ky_bao_cao AS (
    SELECT
        t.today_date,
        DATE '2026-06-21' AS win_start
    FROM (
        SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
    ) t
),

biz AS (
    SELECT
        order_code,
        MAX(get_json_int(data, '$.shopee_business_type')) AS shopee_business_type
    FROM default_catalog.sr_clean.online_core__shipping_order__created_date
    WHERE client_id = 224845
      AND dt >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '2' DAY
      AND dt <= (SELECT today_date FROM ky_bao_cao)
    GROUP BY order_code
),

Raw_Order AS (
    SELECT
        A.`OrderCode`            AS ordercode,
        MAX(A.`CurrentStatus`)   AS currentstatus,
        MAX(A.`CancelTime`)      AS canceltime,
        MAX(A.`ActualPickType`)  AS actualpicktype,
        MAX(A.`PickWH`)          AS pickwh,
        MAX(A.`EndPickTime`)     AS endpicktime,
        MIN(A.`CreatedDate`)     AS createddate,
        MAX(A.`OrderDate`)       AS orderdate
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate` A
    WHERE A.`ClientID` = 224845
      AND A.`CreatedDate_Partition` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '7' DAY
    GROUP BY A.`OrderCode`
),

bc_first AS (
    SELECT
        o.order_code,
        o.pick_warehouse_id AS bc_dropoff_id,
        ELEMENT_AT(ARRAY_AGG(get_json_int(t.it, '$.pick_warehouse_id')
                             ORDER BY get_json_string(t.it, '$.updated_date') ASC), 1) AS bc_first_id
    FROM default_catalog.sr_clean.online_core__shipping_order__end_pick_time o
    CROSS JOIN UNNEST(CAST(parse_json(o.warehouse_log) AS ARRAY<JSON>)) AS t(it)
    WHERE o.client_id = 224845
      AND o.dt >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '7' DAY
      AND o.order_code IN (SELECT ordercode FROM Raw_Order WHERE actualpicktype = 'DropAtStation')
    GROUP BY o.order_code, o.pick_warehouse_id
),

Raw_Pick AS (
    SELECT
        A.ordercode,
        B.`Fromregion_new` AS fromregion_new,
        -- TRIM: có hub chỉ khác nhau dấu cách cuối tên, Sheets cắt dấu cách nên hai dòng thành trùng khoá khi nạp.
        TRIM(CASE
            WHEN A.actualpicktype = 'DropAtStation'
             AND m.bc_first_id <> m.bc_dropoff_id
             AND w.warehouse_name IS NOT NULL
            THEN w.warehouse_name
            ELSE A.pickwh
        END) AS hub,
        A.currentstatus,
        A.canceltime,
        A.endpicktime,
        B.first_valid_pickup_time,
        C.shopee_business_type,
        GREATEST(
            DATE(A.orderdate),
            CASE
                WHEN HOUR(A.createddate) < 16 THEN DATE(A.createddate)
                ELSE DATE(A.createddate) + INTERVAL '1' DAY
            END
        ) AS pickup_order_date
    FROM Raw_Order A
    LEFT JOIN sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
        ON A.ordercode = B.`OrderCode`
        AND B.`LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '10' DAY
    LEFT JOIN biz C
        ON C.order_code = A.ordercode
    LEFT JOIN bc_first m
        ON m.order_code = A.ordercode
    LEFT JOIN default_catalog.sr_dim.dim_warehouse w
        ON w.warehouse_id = m.bc_first_id
),

Hub_Day AS (
    SELECT
        pickup_order_date AS report_date,
        CASE
            WHEN fromregion_new = 'HCM' AND hub LIKE '%Giao Hàng Nặng%' THEN 'HCM - GXT'
            ELSE fromregion_new
        END AS region,
        hub,
        CASE
            WHEN hub LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN hub LIKE '%Key Account%' THEN 'KA'
            WHEN hub LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            ELSE 'BC'
        END AS hub_type,
        'SPE Reverse' AS client_name,
        COUNT(DISTINCT CASE
            WHEN (currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel'
            THEN ordercode
        END) AS mau_pu,
        COUNT(DISTINCT CASE
            WHEN ((currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel')
             AND DATE(COALESCE(first_valid_pickup_time, endpicktime)) <= pickup_order_date
            THEN ordercode
        END) AS ontime_pu_1st,
        COUNT(DISTINCT CASE
            WHEN ((currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel')
             AND endpicktime IS NOT NULL AND DATE(endpicktime) <= pickup_order_date
            THEN ordercode
        END) AS ontime_pu_opr,
        COUNT(DISTINCT CASE
            WHEN ((currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel')
             AND endpicktime IS NOT NULL
            THEN ordercode
        END) AS pud
    FROM Raw_Pick
    WHERE (shopee_business_type = 1 OR shopee_business_type IS NULL)
      AND pickup_order_date >= (SELECT win_start FROM ky_bao_cao)
      AND pickup_order_date <= (SELECT today_date FROM ky_bao_cao) - INTERVAL '1' DAY
    GROUP BY 1, 2, 3, 4, 5
)

SELECT
    report_date, region, hub, hub_type, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, client_name
FROM Hub_Day
ORDER BY report_date DESC, region, hub
