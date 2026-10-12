-- TEST: FD theo lane-ngày, backfill tuần nguyên (query gốc: D-22..D-8) + week_start.
-- Range: report_date (EndPickTime) từ thứ Hai cách 8 tuần trước tuần hiện tại đến today-8
-- (FD không xuất 8 ngày gần nhất vì tử số cần thời gian để hình thành).
-- Bỏ Region_Day_Pct / Best_L6W_FD / Sameday_Map: các nhóm này so theo 46 ngày và cùng ngày
-- tháng trước, đổi range sẽ sai nghĩa.
-- Cửa sổ quét nguồn nới thêm so với range (giữ biên giống query gốc: partition +6, LoadDate +8).
WITH ky_bao_cao AS (
    SELECT
        t.today_date,
        CAST(date_trunc('week', t.today_date) AS DATE) - INTERVAL '56' DAY AS win_start
    FROM (
        SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
    ) t
),

Raw_FD AS (
    SELECT
        A.`OrderCode` AS ordercode,
        A.`ClientID` AS clientid,
        CASE A.`ClientID`
            WHEN 18692 THEN 'SPE'
            WHEN 3892833 THEN 'SPB'
        END AS client_name,
        CASE
            WHEN B.`Toregion_new` = 'HCM' AND A.`DeliveryWH` LIKE '%Giao Hàng Nặng%'
            THEN 'HCM - GXT'
            ELSE B.`Toregion_new`
        END AS region,
        A.`DeliveryWarehouseID` AS wh_id,
        A.`DeliveryWH` AS deliverywh,
        CASE
            WHEN A.`DeliveryWH` LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN A.`DeliveryWH` LIKE '%Key Account%' THEN 'KA'
            WHEN A.`DeliveryWH` LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            ELSE 'BC'
        END AS hub_type,
        A.`EndPickTime` AS endpicktime,
        A.`StartReturnTime` AS startreturntime
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate` A
    LEFT JOIN sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
        ON A.`OrderCode` = B.`OrderCode`
        AND B.`LoadDate` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '8' DAY
    WHERE
        A.`ClientID` IN (18692, 3892833)
        AND A.`CreatedDate_Partition` >= (SELECT win_start FROM ky_bao_cao) - INTERVAL '6' DAY
),

Lane_Day AS (
    SELECT
        DATE(endpicktime) AS report_date,
        date_trunc('week', DATE(endpicktime)) AS week_start,
        region,
        wh_id,
        deliverywh,
        hub_type,
        client_name,
        COUNT(DISTINCT ordercode) AS mau_fd,
        COUNT(DISTINCT CASE
            WHEN startreturntime IS NOT NULL THEN ordercode
        END) AS fd_hoan_thanh
    FROM Raw_FD
    WHERE
        endpicktime IS NOT NULL
        AND DATE(endpicktime) >= (SELECT win_start FROM ky_bao_cao)
        AND DATE(endpicktime) <= (SELECT today_date FROM ky_bao_cao) - INTERVAL '8' DAY
    GROUP BY 1, 2, 3, 4, 5, 6, 7
)

SELECT
    report_date, week_start, region, wh_id, deliverywh, hub_type, client_name,
    mau_fd, fd_hoan_thanh
FROM Lane_Day
ORDER BY report_date DESC, region, deliverywh
