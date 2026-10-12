-- TEST: Deli 1st / ODR theo hub-ngày, backfill tuần nguyên (query gốc: 14 ngày) + week_start.
-- Range: report_date (deadline) từ thứ Hai cách 8 tuần trước tuần hiện tại đến today-1,
-- tức 8 tuần nguyên + tuần hiện tại. Bỏ Best_L6W / Sameday_Map: hai nhóm này so theo 46 ngày
-- và cùng ngày tháng trước, đổi range sẽ sai nghĩa.
-- LoadDate nới thêm 7 ngày so với range (giữ biên giống query gốc: deadline T-46, LoadDate T-53).
WITH ky_bao_cao AS (
    SELECT
        t.today_date,
        CAST(date_trunc('week', t.today_date) AS DATE) - INTERVAL '56' DAY AS win_start
    FROM (
        SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
    ) t
),

Raw_Deli AS (
    SELECT
        B.`OrderCode` AS ordercode,
        B.`ClientID` AS clientid,
        CASE
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 18692   THEN 'SPE'
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 3892833 THEN 'SPB'
        END AS client_name,
        CASE
            WHEN B.`Toregion_new` = 'HCM' AND B.`DeliveryWH` LIKE '%Giao Hàng Nặng%'
            THEN 'HCM - GXT'
            ELSE B.`Toregion_new`
        END AS region,
        B.`DeliveryWarehouseID`       AS wh_id,
        B.`DeliveryWH`                AS hub,
        CASE
            WHEN B.`DeliveryWH` LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN B.`DeliveryWH` LIKE '%Key Account%' THEN 'KA'
            WHEN B.`DeliveryWH` LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            ELSE 'BC'
        END AS hub_type,
        B.`EndPickTime` AS endpicktime,
        B.`EndDeliveryTime` AS enddeliverytime,
        B.`CurrentStatus` AS currentstatus,
        B.deadline_delivery_sla_new,
        B.first_valid_delivery_time
    FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
    WHERE
        (CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) IN (18692, 3892833))
        AND B.`LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '7' DAY
        AND (B.`ClientID` LIKE '18692%' OR B.`ClientID` LIKE '3892833%')
),

Hub_Day AS (
    SELECT
        DATE(deadline_delivery_sla_new) AS report_date,
        date_trunc('week', DATE(deadline_delivery_sla_new)) AS week_start,
        region,
        wh_id,
        hub,
        hub_type,
        client_name,
        COUNT(DISTINCT ordercode) AS mau_deli,
        COUNT(DISTINCT CASE
            WHEN DATE(COALESCE(first_valid_delivery_time, enddeliverytime)) <= DATE(deadline_delivery_sla_new)
            THEN ordercode
        END) AS ontime_deli_1st,
        COUNT(DISTINCT CASE
            WHEN currentstatus = 'delivered'
             AND enddeliverytime IS NOT NULL
             AND DATE(enddeliverytime) <= DATE(deadline_delivery_sla_new)
            THEN ordercode
        END) AS ontime_deli_odr
    FROM Raw_Deli
    WHERE
        endpicktime IS NOT NULL
        AND deadline_delivery_sla_new IS NOT NULL
        AND DATE(deadline_delivery_sla_new) >= (SELECT win_start FROM ky_bao_cao)
        AND DATE(deadline_delivery_sla_new) <= (SELECT today_date FROM ky_bao_cao) - INTERVAL '1' DAY
    GROUP BY 1, 2, 3, 4, 5, 6, 7
)

SELECT
    report_date, week_start, region, wh_id, hub, hub_type, client_name,
    mau_deli, ontime_deli_1st, ontime_deli_odr
FROM Hub_Day
ORDER BY report_date DESC, region, hub
