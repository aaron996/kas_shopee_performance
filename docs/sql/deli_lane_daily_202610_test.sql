-- KAS-314 TEST: 1st Deli / ODR theo ngày x lane x client x loại hub, tháng 10/2026.
-- Cùng định nghĩa với docs/sql/deli_weekly_60d_test.sql (mẫu = đơn đã lấy xong, có hạn giao
-- deadline_delivery_sla_new; 1st = giao lần đầu hợp lệ <= hạn; ODR = delivered, giao xong <= hạn),
-- chỉ đổi grain: bỏ region / wh_id / hub, thêm lane (ExternalLane_New).
-- Partition: Dtm_KA_Shopee partition theo LoadDate -> luôn có cận dưới LoadDate. Cận dưới = đầu kỳ - 7 ngày
-- (cùng biên 7 ngày với query Deli gốc). Không đặt cận trên: đơn load trễ sau hạn giao vẫn phải được tính.
-- Kỳ test: deadline giao từ 2026-10-01 đến 2026-10-31. Cuối kỳ là literal để dễ audit, không dùng CTE ngày.
WITH Raw_Deli AS (
    SELECT
        B.`OrderCode` AS ordercode,
        CASE
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 18692   THEN 'SPE'
            WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 3892833 THEN 'SPB'
        END AS client_name,
        TRIM(B.`ExternalLane_New`) AS lane,
        CASE
            WHEN B.`DeliveryWH` LIKE '%Ahamove%' THEN 'Ahamove'
            WHEN B.`DeliveryWH` LIKE '%Key Account%' THEN 'KA'
            WHEN B.`DeliveryWH` LIKE '%Giao Hàng Nặng%' THEN 'GXT'
            -- Kho "(XXX) KD|KT ..." gắn BC KD, đồng bộ với bước gắn nhãn trong Apps Script sync.
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
        B.`LoadDate` >= DATE '2026-10-01' - INTERVAL '7' DAY
        AND (B.`ClientID` LIKE '18692%' OR B.`ClientID` LIKE '3892833%')
)

SELECT
    DATE(deadline_delivery_sla_new) AS report_date,
    lane,
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
    AND endpicktime IS NOT NULL
    AND deadline_delivery_sla_new IS NOT NULL
    AND DATE(deadline_delivery_sla_new) >= DATE '2026-10-01'
    AND DATE(deadline_delivery_sla_new) <= DATE '2026-10-31'
GROUP BY 1, 2, 3, 4
ORDER BY report_date DESC, client_name, lane, hub_type
