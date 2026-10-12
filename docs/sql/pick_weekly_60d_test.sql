-- TEST: 1st Pickup / OPR theo hub-ngày, backfill tuần nguyên (query gốc: 14 ngày) + week_start.
-- Bỏ best_l6w / sameday_lm: hai nhóm này so theo 46 ngày và cùng ngày tháng trước, đổi range sẽ sai nghĩa.
-- Range: report_date từ thứ Hai cách 8 tuần trước tuần hiện tại đến today-1 (8 tuần nguyên + tuần
-- hiện tại). Các cửa sổ quét nguồn nới thêm so với range: partition 7 ngày, LoadDate 10, biz 2. Partition 2 ngày làm tuần đầu thiếu 12 đơn.
WITH ky_bao_cao AS (
    SELECT
        t.today_date,
        CAST(date_trunc('week', t.today_date) AS DATE) - INTERVAL '56' DAY AS win_start,
        DATE '2026-08-01' AS cutover_date
    FROM (
        SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
    ) t
),

biz AS (
    SELECT
        order_code,
        MAX(get_json_int(data, '$.shopee_business_type')) AS shopee_business_type
    FROM default_catalog.sr_clean.online_core__shipping_order__created_date
    WHERE client_id IN (18692, 3892833)
      AND dt >= GREATEST(
            (SELECT win_start FROM ky_bao_cao) - INTERVAL '2' DAY,
            (SELECT cutover_date FROM ky_bao_cao) - INTERVAL '1' DAY
          )
      AND dt <= (SELECT today_date FROM ky_bao_cao)
    GROUP BY order_code
),

Raw_Pick AS (
    SELECT
        A.`OrderCode` AS ordercode,
        A.`ClientID` AS clientid,
        CASE A.`ClientID`
            WHEN 18692 THEN 'SPE'
            WHEN 3892833 THEN 'SPB'
        END AS client_name,
        CASE
            WHEN B.`Fromregion_new` = 'HCM' AND A.`PickWH` LIKE '%Giao Hàng Nặng%'
            THEN 'HCM - GXT'
            ELSE B.`Fromregion_new`
        END AS region,
        A.`PickWH`              AS hub,
        CASE
            WHEN A.`PickWH` LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN A.`PickWH` LIKE '%Key Account%' THEN 'KA'
            WHEN A.`PickWH` LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            ELSE 'BC'
        END AS hub_type,
        A.`CurrentStatus` AS currentstatus,
        A.`IsExpectedDropOff` AS isexpecteddropoff,
        A.`EndPickTime` AS endpicktime,
        A.`CancelTime` AS canceltime,
        A.`Channel` AS channel,
        C.shopee_business_type,
        B.first_valid_pickup_time,
        CASE
            WHEN DATE(A.`OrderDate`) = DATE(A.`CreatedDate`) AND HOUR(A.`CreatedDate`) >= 19
            THEN DATE(A.`OrderDate`) + INTERVAL '1' DAY
            ELSE DATE(A.`OrderDate`)
        END AS pickup_order_date
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate` A
    LEFT JOIN sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
        ON A.`OrderCode` = B.`OrderCode`
        AND B.`LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '10' DAY
    LEFT JOIN biz C
        ON C.order_code = A.`OrderCode`
    WHERE
        A.`ClientID` IN (18692, 3892833)
        AND A.`CreatedDate_Partition` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '7' DAY
),

Hub_Day AS (
    SELECT
        pickup_order_date AS report_date,
        date_trunc('week', pickup_order_date) AS week_start,
        region,
        hub,
        hub_type,
        client_name,
        COUNT(DISTINCT CASE
            WHEN (currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel'
            THEN ordercode
        END) AS mau_pu,
        COUNT(DISTINCT CASE
            WHEN ((currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel')
             AND first_valid_pickup_time IS NOT NULL AND DATE(first_valid_pickup_time) <= pickup_order_date
            THEN ordercode
        END) AS ontime_pu_1st,
        COUNT(DISTINCT CASE
            WHEN ((currentstatus = 'cancel' AND DATE(canceltime) > pickup_order_date) OR currentstatus != 'cancel')
             AND endpicktime IS NOT NULL AND DATE(endpicktime) <= pickup_order_date
            THEN ordercode
        END) AS ontime_pu_opr
    FROM Raw_Pick
    WHERE
        (
            (pickup_order_date <  (SELECT cutover_date FROM ky_bao_cao) AND COALESCE(channel, '') <> 'WH - Shopee')
            OR
            (pickup_order_date >= (SELECT cutover_date FROM ky_bao_cao) AND COALESCE(shopee_business_type, -1) <> 3)
        )
        AND isexpecteddropoff = FALSE
        AND pickup_order_date >= (SELECT win_start FROM ky_bao_cao)
        AND pickup_order_date <= (SELECT today_date FROM ky_bao_cao) - INTERVAL '1' DAY
    GROUP BY 1, 2, 3, 4, 5, 6
)

SELECT
    report_date, week_start, region, hub, hub_type, client_name,
    mau_pu, ontime_pu_1st, ontime_pu_opr
FROM Hub_Day
ORDER BY report_date DESC, region, hub
