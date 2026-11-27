-- KAS-314: 1st Deli / ODR theo ngày x lane x client x loại hub, cửa sổ cuộn 8 tuần nguyên + tuần hiện tại.
-- Dùng cho datajob (Starrocks -> OPS Sheet, tab lane_deli_tmp) rồi lane-deli-sync.gs đẩy vào kas_deli_lane_daily.
-- Cùng định nghĩa và cùng cửa sổ với docs/sql/deli_weekly_60d_test.sql: report_date (deadline) từ thứ Hai
-- cách 8 tuần trước tuần hiện tại đến today-1; LoadDate >= win_start - 7 ngày (đã đối chiếu tháng 10/2026:
-- tổng mau_deli / 1st / ODR theo client khớp tuyệt đối với query tuần, xem docs/kas-314-lane-validation.md).
-- Cột kết quả khớp lane-deli-sync.gs: report_date, lane, vung_giao, client_name, hub_type, mau_deli, ontime_deli_1st, ontime_deli_odr.
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
        CASE
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 18692   THEN 'SPE'
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 3892833 THEN 'SPB'
        END AS client_name,
        TRIM(B.`ExternalLane_New`) AS lane,
        B.`Toregion_new` AS vung_giao,
        CASE
            WHEN B.`DeliveryWH` LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN B.`DeliveryWH` LIKE '%Key Account%' THEN 'KA'
            WHEN B.`DeliveryWH` LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            WHEN REGEXP(TRIM(B.`DeliveryWH`), '^[(][^)]*[)] (KD|KT) .*') THEN 'BC KD'
            ELSE 'BC'
        END AS hub_type,
        B.`EndPickTime` AS endpicktime,
        B.`EndDeliveryTime` AS enddeliverytime,
        B.`CurrentStatus` AS currentstatus,
        B.deadline_delivery_sla_new,
        B.first_valid_delivery_time
    FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
    WHERE
        B.`LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '7' DAY
        AND (B.`ClientID` LIKE '18692%' OR B.`ClientID` LIKE '3892833%')
)

SELECT
    DATE(deadline_delivery_sla_new) AS report_date,
    lane,
    vung_giao,
    client_name,
    hub_type,
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
    client_name IS NOT NULL
    AND vung_giao IS NOT NULL
    AND endpicktime IS NOT NULL
    AND deadline_delivery_sla_new IS NOT NULL
    AND DATE(deadline_delivery_sla_new) >= (SELECT win_start FROM ky_bao_cao)
    AND DATE(deadline_delivery_sla_new) <= (SELECT today_date FROM ky_bao_cao) - INTERVAL '1' DAY
GROUP BY 1, 2, 3, 4, 5
ORDER BY report_date DESC, client_name, lane, vung_giao, hub_type
