-- ============================================================
-- LEADTIME TỪNG CHẶNG (Prepickup / First-mile / Middle-mile / Last-mile / E2E)
-- Group by: report_date, fromprovince_new, toprovince_new, externallane_new, client_name
-- Scope: Shopee SPE (clientid 18692) + SPB (clientid 3892833)
-- Engine: StarRocks, catalog sr_ghn_reporting (schema ka, BQ passthrough)
--
-- Nguồn cho tab 3 "Leadtime từng chặng" của app kas_shopee_performance.
-- Output đẩy vào Supabase `kas_leadtime_data` qua Apps Script (tab gid 396308004).
-- ============================================================
-- REVIEW 2026-08-20 (đối chiếu output thật 88.480 dòng / 46 ngày / 12,67M đơn)
-- Xem chi tiết: docs/leadtime-tab-rebuild-plan.md mục 2.5.
--
-- [OK] Không có leadtime âm ở cả 5 cột -> hướng tham số DATE_DIFF đã đúng.
-- [OK] Σ4 chặng ≈ avg_lt_e2e_hour ở mức tổng (lệch -0,3%..+0,2%) cho hầu hết
--      lane × client -> định nghĩa chặng nhất quán.
--
-- [!] 1. report_date = DATE(createddate) + filter currentstatus='delivered'
--        => cohort theo ngày TẠO đơn, các ngày gần nhất bị censoring nặng.
--        Đo trên output thật: E2E theo ngày 15/8 -5,8% · 16/8 -10,8% ·
--        17/8 -31,7% · 18/8 -53,0% · 19/8 -93,6% so trung vị 7-21 ngày trước
--        (19/8 chỉ còn 17 dòng / 2.796 đơn = 1% sản lượng ngày thường).
--        => Không phải lỗi SQL, là bản chất cohort. Nhưng dashboard KHÔNG được
--        default vào ngày mới nhất. Đề xuất: thêm cột report_date_deli =
--        DATE(enddeliverytime) để dashboard vận hành dùng (mỗi ngày chốt luôn),
--        giữ report_date hiện tại cho phân tích SLA theo ngày tạo.
--
-- [!] 2. AVG từng chặng tính trên tập đơn KHÁC NHAU (đơn thiếu 1 mốc bị loại
--        khỏi AVG của chặng đó nhưng vẫn nằm trong AVG e2e, vì e2e chỉ cần
--        createddate + enddeliverytime). Hệ quả: Σ4 > E2E ở nhóm có nhiều đơn
--        thiếu mốc — tập trung ở Intra city SPB (HCM->HCM, HNO->HNO): lệch
--        +5..+9,5h (+13%..+31%), 558.334 đơn. Tổng 2.358/81.920 dòng lệch >5%
--        (5,04% sản lượng).
--        => Đề xuất: thêm COUNT riêng từng chặng (mau_prepickup, mau_firstmile,
--        mau_middlemile, mau_lastmile) HOẶC tính 4 chặng trên cohort chung
--        (đơn có đủ 4 mốc) và giữ mau/e2e trên toàn bộ đơn delivered.
--        Cần kiểm ở mức order-level để xác nhận giả thuyết này.
--
-- [!] 3. LEFT JOIN Shopee_Fallback trượt -> from/to/lane đều NULL: 87 dòng,
--        1.622 đơn (0,013%), rải đều ~2 dòng/ngày, cả SPE và SPB. Nguyên nhân
--        khả năng cao: cửa sổ LoadDate của Dtm_KA_Shopee không phủ hết đơn có
--        CreatedDate_Partition trong 46 ngày (đơn tạo sát biên). Cân nhắc nới
--        cửa sổ LoadDate rộng hơn cửa sổ CreatedDate_Partition.
--
-- [!] 4. Dòng có ít nhất 1 chặng NULL: 489 dòng (0,55%), 730 đơn (0,006%).
--        Pattern: firstmile+middlemile NULL 315 dòng · prepickup+firstmile NULL
--        152 dòng · firstmile NULL 15 · 3 chặng NULL 7. lastmile và e2e không
--        bao giờ NULL. => Đúng là ad hoc, app tạm loại (xem plan mục 2.5).
--
-- [!] 5. AVG không trim outlier: có dòng lastmile 418h (17,4 ngày), e2e 492h
--        (20,5 ngày) — toàn bộ đều mau=1. Lọc mẫu ít ở app xử lý được, nhưng
--        nếu muốn số sạch từ nguồn thì cân nhắc cắt p99 hoặc trần cứng.
-- ============================================================
--
-- Engine: StarRocks, catalog sr_ghn_reporting (schema ka, BQ passthrough)
-- Nguồn: ka.`Dtm_KA_V3_CreatedDate` (mốc chặng) LEFT JOIN ka.`Dtm_KA_Shopee`
--        (lấy first_valid_delivery_time để fallback COALESCE, và
--        fromprovince_new/toprovince_new/externallane_new — các cột này
--        KHÔNG tồn tại trên Dtm_KA_V3_CreatedDate, chỉ có ở Dtm_KA_Shopee)
--
-- ĐỊNH NGHĨA CHẶNG (theo tham khảo user cung cấp — chỉ định nghĩa, không
-- copy nguyên logic vì khác engine/bảng):
--   lt_prepickup  = CreatedDate -> FirstCreatedPickedUpTime
--                   (từ tạo đơn đến thời điểm GÁN chuyến lấy hàng lần 1,
--                    không phải lấy hàng thành công thực tế)
--   lt_firstmile  = FirstCreatedPickedUpTime -> OutboundPickWHTime
--   lt_middlemile = OutboundPickWHTime -> mốc nhập hub giao (coalesce)
--   lt_lastmile   = mốc nhập hub giao (coalesce) -> EndDeliveryTime
--   lt_e2e        = CreatedDate -> EndDeliveryTime
--
-- Mốc "nhập hub giao" dùng COALESCE 3 lớp theo yêu cầu:
--   COALESCE(InboundDeliveryHubTime, FirstDeliveredCreatedTime,
--            first_valid_delivery_time)
--   (InboundDeliveryHubTime ưu tiên trước; 2 cột sau chỉ là fallback khi
--    đơn không có mốc quét nhập hub — ví dụ giao thẳng/không qua hub).
--
-- QUY TẮC ĐÃ ÁP DỤNG:
--  - Partition filter (CreatedDate_Partition) đặt trong CTE riêng, ở WHERE,
--    không đặt trong JOIN ON.
--  - Literal date inline, không CROSS JOIN CTE ngày riêng.
--  - clientid ở Dtm_KA_V3_CreatedDate là BIGINT plain (khác Dtm_KA_Shopee
--    là VARCHAR compound '18692 - ...') -> so sánh trực tiếp bằng IN(...).
--  - Dtm_KA_Shopee.ClientID là VARCHAR compound -> vẫn cần split_part khi
--    lọc phía đó (dù ở đây không lọc, chỉ lấy 1 cột qua JOIN theo OrderCode).
-- ============================================================

WITH ky_bao_cao AS (
    SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
),

Base_V3 AS (
    SELECT
        `OrderCode`                    AS ordercode,
        `ClientID`                     AS clientid,
        CASE
            WHEN `ClientID` = 18692   THEN 'SPE'
            WHEN `ClientID` = 3892833 THEN 'SPB'
        END                             AS client_name,
        `CreatedDate`                   AS createddate,
        `FirstCreatedPickedUpTime`      AS firstcreatedpickeduptime,
        `OutboundPickWHTime`            AS outboundpickwhtime,
        `InboundDeliveryHubTime`        AS inbounddeliveryhubtime,
        `FirstDeliveredCreatedTime`     AS firstdeliveredcreatedtime,
        `EndDeliveryTime`               AS enddeliverytime,
        `CurrentStatus`                 AS currentstatus
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate`
    WHERE
        `ClientID` IN (18692, 3892833)
        AND `CreatedDate_Partition` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '46' DAY
),

Shopee_Fallback AS (
    -- Lấy first_valid_delivery_time (fallback COALESCE) + fromprovince_new/
    -- toprovince_new/externallane_new (3 cột này CHỈ tồn tại ở Dtm_KA_Shopee,
    -- không có ở Dtm_KA_V3_CreatedDate) — KHÔNG lọc client ở đây vì Base_V3
    -- đã lọc rồi; dedup theo OrderCode để tránh fan-out nếu Dtm_KA_Shopee có
    -- duplicate (lấy MIN cho timestamp, MAX(giá trị bất kỳ) cho các cột
    -- dimension vì theo giả định 1 order_code chỉ có 1 tuyến/lane cố định).
    SELECT
        `OrderCode`                     AS ordercode,
        MIN(first_valid_delivery_time)  AS first_valid_delivery_time,
        MAX(fromprovince_new)           AS fromprovince_new,
        MAX(toprovince_new)             AS toprovince_new,
        MAX(externallane_new)           AS externallane_new
    FROM sr_ghn_reporting.ka.`Dtm_KA_Shopee`
    WHERE `LoadDate` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '46' DAY
    GROUP BY `OrderCode`
),

Raw_Leadtime AS (
    SELECT
        b.ordercode,
        b.client_name,
        s.fromprovince_new,
        s.toprovince_new,
        s.externallane_new,
        DATE(b.createddate) AS report_date,
        COALESCE(b.inbounddeliveryhubtime, b.firstdeliveredcreatedtime, s.first_valid_delivery_time) AS inbound_hub_effective,
        -- [FIX] StarRocks DATE_DIFF(unit, end, start) = end - start, NGƯỢC
        -- với Trino DATE_DIFF(unit, start, end). Đã verify: mọi leadtime ra
        -- âm 100% trên sample thực tế -> đảo thứ tự tham số (end, start) để
        -- ra dương đúng nghĩa "thời gian trôi qua từ mốc trước đến mốc sau".
        CAST(DATE_DIFF('minute', b.firstcreatedpickeduptime, b.createddate) AS DOUBLE) / 60 AS lt_prepickup,
        CAST(DATE_DIFF('minute', b.outboundpickwhtime, b.firstcreatedpickeduptime) AS DOUBLE) / 60 AS lt_firstmile,
        CAST(DATE_DIFF('minute', COALESCE(b.inbounddeliveryhubtime, b.firstdeliveredcreatedtime, s.first_valid_delivery_time), b.outboundpickwhtime) AS DOUBLE) / 60 AS lt_middlemile,
        CAST(DATE_DIFF('minute', b.enddeliverytime, COALESCE(b.inbounddeliveryhubtime, b.firstdeliveredcreatedtime, s.first_valid_delivery_time)) AS DOUBLE) / 60 AS lt_lastmile,
        CAST(DATE_DIFF('minute', b.enddeliverytime, b.createddate) AS DOUBLE) / 60 AS lt_e2e
    FROM Base_V3 b
    LEFT JOIN Shopee_Fallback s
        ON s.ordercode = b.ordercode
    WHERE
        b.currentstatus = 'delivered'
        AND b.enddeliverytime IS NOT NULL
)

SELECT
    report_date,
    fromprovince_new,
    toprovince_new,
    externallane_new,
    client_name,
    COUNT(DISTINCT ordercode)                          AS mau,
    ROUND(AVG(lt_prepickup), 2)                         AS avg_lt_prepickup_hour,
    ROUND(AVG(lt_firstmile), 2)                         AS avg_lt_firstmile_hour,
    ROUND(AVG(lt_middlemile), 2)                        AS avg_lt_middlemile_hour,
    ROUND(AVG(lt_lastmile), 2)                          AS avg_lt_lastmile_hour,
    ROUND(AVG(lt_e2e), 2)                               AS avg_lt_e2e_hour
FROM Raw_Leadtime
GROUP BY 1, 2, 3, 4, 5
ORDER BY report_date DESC, fromprovince_new, toprovince_new, externallane_new, client_name;
