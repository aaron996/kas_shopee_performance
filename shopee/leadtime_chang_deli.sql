-- ============================================================
-- LEADTIME TỪNG CHẶNG (Prepickup / First-mile / Middle-mile / Last-mile / E2E)
-- Group by: report_date, fromprovince_new, toprovince_new, externallane_new, client_name
--
-- >>> report_date = NGÀY GIAO THÀNH CÔNG = DATE(EndDeliveryTime) <<<
-- (đổi từ DATE(CreatedDate) ngày 2026-08-20 — xem mục [1] trong REVIEW bên dưới)
-- Scope: Shopee SPE (clientid 18692) + SPB (clientid 3892833)
--
-- ============================================================
-- GRAIN THỜI GIAN & BUFFER PARTITION (đọc trước khi sửa 2 hằng số dưới)
--
-- report_date bám ngày GIAO THÀNH CÔNG, nhưng cột partition của
-- Dtm_KA_V3_CreatedDate là CreatedDate_Partition (ngày TẠO đơn). Hai trục lệch
-- nhau đúng bằng leadtime của đơn, nên phải quét ngày tạo RỘNG HƠN khoảng ngày
-- giao muốn xuất, nếu không những ngày giao đầu dải sẽ thiếu đơn có leadtime dài.
--
--   OUTPUT_DAYS = 46   -- số ngày GIAO muốn xuất (kết thúc ở hôm qua)
--   TAIL_DAYS   = 30   -- buffer leadtime: đơn giao trong dải có thể đã tạo
--                      -- trước đó tới 30 ngày
--   SCAN_DAYS   = 76   -- = OUTPUT_DAYS + TAIL_DAYS, dùng cho
--                      -- CreatedDate_Partition và LoadDate
--
-- Điều kiện đủ: ngày giao D là đầy đủ khi mọi đơn giao ngày D đều có
-- createddate >= today - SCAN_DAYS, tức leadtime <= D - (today - SCAN_DAYS).
-- Ngày sớm nhất xuất ra là D = today - 46 -> ngân sách leadtime = 30 ngày.
--
-- TAIL_DAYS = 30 chọn từ phân bố thật (output 46 ngày, 11,9M đơn đã chín):
--   E2E <= 4 ngày: 97,46% đơn · <= 5 ngày: 99,92% · <= 7 ngày: 99,9953%
--   trung bình nhóm dài nhất: 20,5 ngày
-- 30 ngày phủ trên cả mốc dài nhất. Muốn siết scan thì hạ TAIL_DAYS, nhưng
-- phải chạy QA ở cuối file trước khi hạ.
--
-- Hệ quả tốt: mỗi ngày giao chốt xong là đứng yên, KHÔNG còn censoring như
-- grain ngày tạo -> app bỏ được toàn bộ cơ chế is_mature / loại 5 ngày cuối.
-- ============================================================
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
-- [x] 1. ĐÃ SỬA 2026-08-20 — report_date đổi sang DATE(EndDeliveryTime).
--        Lý do: bản cũ dùng DATE(createddate) + filter currentstatus='delivered'
--        => cohort theo ngày TẠO đơn, các ngày gần nhất bị censoring nặng vì chỉ
--        đơn giao nhanh mới kịp 'delivered'. Đo trên output cũ, E2E weighted so
--        trung vị 7-21 ngày trước: 15/8 -5,8% · 16/8 -10,8% · 17/8 -31,7% ·
--        18/8 -53,0% · 19/8 -93,6% (19/8 chỉ còn 17 dòng / 2.796 đơn = 1% sản
--        lượng ngày thường, E2E hiện 3,73h thay vì ~58h).
--        Grain ngày giao không có vấn đề này: đơn đã giao thì không đổi nữa.
--        Kèm theo: nới scan partition lên SCAN_DAYS = 76 (xem khối GRAIN ở trên)
--        và chốt dải output ở hôm qua để không có ngày giao dở dang.
--        LƯU Ý: schema output KHÔNG đổi (vẫn 11 cột, vẫn tên report_date) nên
--        bảng Supabase kas_leadtime_data và Apps Script không cần sửa gì.
--        Nếu sau này cần phân tích SLA theo cohort ngày tạo thì tách file query
--        riêng — KHÔNG trộn 2 grain vào cùng 1 output.
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
-- [~] 3. LEFT JOIN Shopee_Fallback trượt -> from/to/lane đều NULL: 87 dòng,
--        1.622 đơn (0,013%), rải đều ~2 dòng/ngày, cả SPE và SPB.
--        Bản này đã nới LoadDate từ 46 -> SCAN_DAYS (76) ngày, bằng đúng cửa sổ
--        CreatedDate_Partition, nên số dòng lane rỗng dự kiến giảm. Chạy lại rồi
--        đếm lại để xác nhận; nếu vẫn còn thì nguyên nhân không phải cửa sổ.
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
        `CurrentStatus`                 AS currentstatus   -- giữ để audit, filter đã ở WHERE dưới
    FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate`
    WHERE
        `ClientID` IN (18692, 3892833)
        -- SCAN_DAYS = 76 = OUTPUT_DAYS 46 + TAIL_DAYS 30.
        -- Rộng hơn dải ngày giao muốn xuất, vì partition là ngày TẠO đơn còn
        -- report_date là ngày GIAO (xem khối GRAIN ở đầu file).
        AND `CreatedDate_Partition` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '76' DAY
        -- Toàn bộ filter phía bảng này gom hết lên đây thay vì để ở Raw_Leadtime:
        -- scan partition đã rộng hơn bản cũ 65% (76 vs 46 ngày), cắt sớm để bù
        -- lại (skill ghn-sql-query-guide mục 4). Mọi điều kiện đều nằm trên
        -- Dtm_KA_V3_CreatedDate nên đẩy lên trước LEFT JOIN không đổi ngữ nghĩa.
        AND `CurrentStatus` = 'delivered'
        AND `EndDeliveryTime` IS NOT NULL
        -- Chốt dải NGÀY GIAO xuất ra: [today - 46, today) = 46 ngày trọn vẹn,
        -- kết thúc ở hôm qua. Không lấy hôm nay vì ngày đó còn chạy dở (chỉ có
        -- đơn giao xong trước lúc chạy query) -> sẽ là ngày khuyết.
        -- So sánh trực tiếp trên timestamp, không bọc DATE() để engine còn đẩy
        -- được filter xuống.
        AND `EndDeliveryTime` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '46' DAY
        AND `EndDeliveryTime` <  (SELECT today_date FROM ky_bao_cao)
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
    -- Cùng SCAN_DAYS = 76 với Base_V3. Bản cũ để 46 ngày (hẹp hơn cửa sổ đơn)
    -- nên đơn tạo sát biên bị trượt JOIN -> from/to/lane NULL (REVIEW mục 3).
    WHERE `LoadDate` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '76' DAY
    GROUP BY `OrderCode`
),

Raw_Leadtime AS (
    SELECT
        b.ordercode,
        b.client_name,
        s.fromprovince_new,
        s.toprovince_new,
        s.externallane_new,
        DATE(b.enddeliverytime) AS report_date,   -- NGÀY GIAO THÀNH CÔNG (đổi từ DATE(createddate))
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
    -- Base_V3 đã lọc xong tệp đơn cần (delivered + dải ngày giao), CTE này chỉ
    -- còn việc tính leadtime. Không đặt filter nào ở ON của LEFT JOIN
    -- (skill mục 3) — làm vậy optimizer có thể bỏ sót.
    LEFT JOIN Shopee_Fallback s
        ON s.ordercode = b.ordercode
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


-- ============================================================
-- QA — CHẠY 3 CÂU NÀY SAU KHI ĐỔI GRAIN, TRƯỚC KHI ĐẨY LÊN SUPABASE
-- (mục 8 "validate trước khi tin kết quả" của ghn-sql-query-guide)
-- ============================================================

-- QA1. TAIL_DAYS = 30 có đủ chưa?
-- Đếm đơn trong dải output có leadtime E2E vượt buffer. Phải ra 0 (hoặc vài đơn
-- lẻ không đáng kể). Nếu ra nhiều -> ngày giao đầu dải đang bị thiếu đơn, phải
-- tăng TAIL_DAYS rồi chạy lại.
/*
WITH ky_bao_cao AS (
    SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
)
SELECT
    COUNT(*)                                                   AS don_vuot_buffer,
    MAX(DATE_DIFF('day', `EndDeliveryTime`, `CreatedDate`))     AS leadtime_dai_nhat_ngay
FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate`
WHERE `ClientID` IN (18692, 3892833)
    AND `CreatedDate_Partition` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '76' DAY
    AND `CurrentStatus` = 'delivered'
    AND `EndDeliveryTime` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '46' DAY
    AND `EndDeliveryTime` <  (SELECT today_date FROM ky_bao_cao)
    AND DATE_DIFF('day', `EndDeliveryTime`, `CreatedDate`) > 30;
*/

-- QA2. Sản lượng theo ngày giao có phẳng không?
-- Grain ngày giao thì mọi ngày phải đầy đủ -> sản lượng dao động theo mùa/ngày
-- trong tuần, nhưng KHÔNG được tụt dần đều về cuối dải như grain ngày tạo.
-- Ngày cuối (hôm qua) phải cùng cỡ các ngày trước, không phải 1% như trước.
/*
WITH ky_bao_cao AS (
    SELECT CAST(CONVERT_TZ(NOW(), 'UTC', 'Asia/Ho_Chi_Minh') AS DATE) AS today_date
)
SELECT
    DATE(`EndDeliveryTime`)          AS ngay_giao,
    COUNT(DISTINCT `OrderCode`)      AS don
FROM sr_ghn_reporting.ka.`Dtm_KA_V3_CreatedDate`
WHERE `ClientID` IN (18692, 3892833)
    AND `CreatedDate_Partition` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '76' DAY
    AND `CurrentStatus` = 'delivered'
    AND `EndDeliveryTime` >= (SELECT today_date FROM ky_bao_cao) - INTERVAL '46' DAY
    AND `EndDeliveryTime` <  (SELECT today_date FROM ky_bao_cao)
GROUP BY 1
ORDER BY 1 DESC;
*/

-- QA3. Lane rỗng còn bao nhiêu sau khi nới LoadDate lên 76 ngày?
-- Bản cũ (LoadDate 46 ngày): 87 dòng / 1.622 đơn. Kỳ vọng giảm.
-- Chạy trên chính output của query chính, hoặc bọc query chính thành CTE rồi:
--   SELECT COUNT(*) AS dong, SUM(mau) AS don FROM <output> WHERE externallane_new IS NULL;

-- ============================================================
-- LƯU Ý VỀ ENGINE / CÚ PHÁP (đối chiếu skill ghn-sql-query-guide mục 10)
--
-- Skill ghi: catalog sr_ghn_reporting chạy qua Trino engine, phải dùng cú pháp
-- Trino. File này thì đang dùng cú pháp StarRocks-native:
--   - quote identifier bằng backtick (Trino dùng dấu ngoặc kép)
--   - CONVERT_TZ(NOW(), ...) (Trino không có, dùng AT TIME ZONE)
--   - DATE_DIFF(unit, end, start) = end - start (Trino là start, end)
--
-- Bằng chứng thực nghiệm nghiêng về StarRocks-native: bản trước của query này
-- chạy ra 88.480 dòng đúng, 0 giá trị âm trên cả 5 cột leadtime. Nếu là Trino
-- thì backtick và CONVERT_TZ đã lỗi cú pháp ngay, không ra được dòng nào.
--
-- => GIỮ NGUYÊN cú pháp StarRocks, không dịch sang Trino. Nhưng nếu chạy bản
-- này mà báo TrinoUserError thì đúng như skill nói và phải chuyển 3 điểm trên:
--   `Col`                              -> "Col"
--   CAST(CONVERT_TZ(NOW(),'UTC','Asia/Ho_Chi_Minh') AS DATE)
--                                      -> CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
--   DATE_DIFF('minute', sau, truoc)    -> DATE_DIFF('minute', truoc, sau)
-- (điểm thứ 3 quan trọng nhất — dịch sai là toàn bộ leadtime ra âm)
-- ============================================================
