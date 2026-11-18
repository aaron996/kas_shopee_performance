-- KAS-314 QA cho deli_lane_daily_202610_test.sql. Chạy riêng từng khối trên Superset.
-- Cùng bộ lọc LoadDate / kỳ / điều kiện mẫu với query chính.

-- QA1: tổng mau_deli / 1st / ODR theo client + số đơn lane rỗng.
-- Đối chiếu: chạy docs/sql/deli_weekly_60d_test.sql, cộng mau_deli theo client trong 10/2026 -> phải khớp.
-- Lane rỗng phải ~0 (lần trước 87 dòng/1.622 đơn do cửa sổ LoadDate; đã nới lên 76 ngày).
SELECT
    CASE WHEN CAST(split_part(B.`ClientID`, ' - ', 1) AS BIGINT) = 18692 THEN 'SPE' ELSE 'SPB' END AS client_name,
    COUNT(DISTINCT B.`OrderCode`) AS mau_deli,
    COUNT(*) AS so_dong,
    COUNT(DISTINCT CASE WHEN COALESCE(TRIM(B.`ExternalLane_New`), '') = '' THEN B.`OrderCode` END) AS don_lane_rong,
    COUNT(DISTINCT CASE WHEN DATE(COALESCE(B.first_valid_delivery_time, B.`EndDeliveryTime`)) <= DATE(B.deadline_delivery_sla_new) THEN B.`OrderCode` END) AS ontime_deli_1st,
    COUNT(DISTINCT CASE WHEN B.`CurrentStatus` = 'delivered' AND B.`EndDeliveryTime` IS NOT NULL
        AND DATE(B.`EndDeliveryTime`) <= DATE(B.deadline_delivery_sla_new) THEN B.`OrderCode` END) AS ontime_deli_odr
FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
WHERE B.`LoadDate` >= DATE '2026-10-01' - INTERVAL '7' DAY
  AND (B.`ClientID` LIKE '18692%' OR B.`ClientID` LIKE '3892833%')
  AND B.`EndPickTime` IS NOT NULL
  AND B.deadline_delivery_sla_new IS NOT NULL
  AND DATE(B.deadline_delivery_sla_new) >= DATE '2026-10-01'
  AND DATE(B.deadline_delivery_sla_new) <= DATE '2026-10-31'
GROUP BY 1;
-- Nếu so_dong > mau_deli: bảng có đơn lặp (nhiều LoadDate) -> phải kiểm tra trước khi tin số.

-- QA2: các giá trị lane thực tế (xác nhận tên cột ExternalLane_New và nhãn "Cross Metro*").
SELECT TRIM(B.`ExternalLane_New`) AS lane, COUNT(DISTINCT B.`OrderCode`) AS so_don
FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee` B
WHERE B.`LoadDate` >= DATE '2026-10-01' - INTERVAL '7' DAY
  AND (B.`ClientID` LIKE '18692%' OR B.`ClientID` LIKE '3892833%')
  AND DATE(B.deadline_delivery_sla_new) >= DATE '2026-10-01'
  AND DATE(B.deadline_delivery_sla_new) <= DATE '2026-10-31'
GROUP BY 1 ORDER BY 2 DESC;
