-- KAS-291: SPE Reverse (client 224845) 1st Pickup / OPR / PUD theo hub-ngày, 14 ngày gần nhất (sync hằng ngày, replace D-14..D-1).
-- Cùng khung với pick_weekly_60d_test.sql, output thêm cột pud.
-- Ngày hẹn lấy = ngày lớn hơn giữa OrderDate và ngày theo giờ tạo đơn (trước 16h = D0, từ 16h = D+1; rule giờ tạo để tránh đơn
-- tạo sau 16h mà OrderDate vẫn hẹn cùng ngày). Lọc shopee_business_type = 1 hoặc NULL. Không loại IsExpectedDropOff mà xử lý
-- DropAtStation: khách ra BC khác BC được gán đầu tiên thì tính cho BC được gán đầu tiên. Không có cutover 01/08 vì
-- created_date đã có shopee_business_type từ trước đó.
-- Range: report_date từ today-14 đến today-1. Cửa sổ quét nguồn nới thêm: partition 7 ngày, LoadDate 10, biz 2, end_pick_time 7.
WITH ky_bao_cao AS (
    SELECT
        t.today_date,
        CAST(t.today_date AS DATE) - INTERVAL '14' DAY AS win_start
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
