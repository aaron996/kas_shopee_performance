# Đồng bộ dữ liệu KAS-221 — Đơn nghi vấn COD (Gối đầu COD & Rút ruột)

Tài liệu hướng dẫn vận hành và cấu hình pipeline đồng bộ dữ liệu từ query StarRocks KAS-221 vào Supabase project `iyjsihwgnzcytbojvoom`.

---

## 1. Nguyên tắc kiến trúc & Boundary dữ liệu

```
StarRocks DW (dtr_lastmile, online_core, iceberg)
        │
        ▼ (Scheduled server-side job: n8n workflow hoặc BI Script)
Chạy query: 01_score_model_hcm_v20_PENDING_VERIFY.sql (Grain: 1 dòng / đơn)
        │
        ▼ (POST HTTPS /rest/v1/rpc/sync_kas_cod_suspicion_data)
Supabase RPC (SECURITY DEFINER, TRUNCATE + INSERT trong 1 transaction)
        │
        ▼
Supabase Tables:
  - public.kas_cod_suspicion_data (Grain: 1 dòng / đơn, RLS: QC & Dev Admin)
  - public.kas_cod_suspicion_metadata (Thời điểm snapshot & số lượng)
        │
        ▼ (Supabase JS Client + User Session RLS)
App React/Vite (src/components/CodSuspicionReport.jsx)
```

- **App client (trình duyệt)** tuyệt đối không kết nối trực tiếp đến StarRocks.
- Dữ liệu đồng bộ vào Supabase theo cơ chế **atomic full-refresh** tương tự như OPS KPI metric: `TRUNCATE` và `INSERT` trong cùng transaction qua RPC `sync_kas_cod_suspicion_data`.
- **Chỉ người có role QC hoặc Dev Admin (`vinhlt@ghn.vn`)** mới có thể đọc bảng qua Supabase RLS.
- Khi không có đơn nghi vấn nào (batch 0 dòng), RPC vẫn cập nhật `kas_cod_suspicion_metadata` với timestamp mới nhất, giúp UI hiển thị chính xác "Cập nhật lúc ... (0 đơn nghi vấn)" mà không bị crash hay hiển thị sai lệch.

---

## 2. Lưu ý về Grain và Ngưỡng trong Query StarRocks

File query gốc `01_score_model_hcm_v20_PENDING_VERIFY.sql` ở dòng 699 có mệnh đề:
```sql
SELECT *
FROM output_full
WHERE rn_trong_tai_xe = 1
  AND (
        CASE WHEN `Mâu thuẫn lý do vs duration (M7)` THEN 1 ELSE 0 END
      + CASE WHEN `Call log giả từ lần thử 2 (M9)` THEN 1 ELSE 0 END
      + CASE WHEN `GPS bất thường lúc thành công (M10)` THEN 1 ELSE 0 END
      + CASE WHEN `GPS trùng khớp giữa nhiều đơn (M11)` THEN 1 ELSE 0 END
      + CASE WHEN `GPS mocked lúc thành công (M12)` THEN 1 ELSE 0 END
      ) >= 2
  AND `Điểm tổng nghi vấn` >= 10
ORDER BY `Điểm tổng nghi vấn` DESC;
```

> [!IMPORTANT]
> **Điều chỉnh Grain để xuất toàn bộ đơn của tài xế nghi vấn:**
> Mệnh đề `WHERE rn_trong_tai_xe = 1` ở bản gốc chỉ xuất 1 đơn đại diện cho mỗi tài xế. Để module hiển thị được **toàn bộ đơn liên quan** khi mở rộng danh sách tài xế (theo đúng yêu cầu bài toán và Mục 4 của DOCX), câu lệnh lọc cuối của pipeline cần lọc các tài xế đủ điều kiện (qualifying drivers) và xuất toàn bộ đơn của các tài xế đó:
>
> ```sql
> WITH qualifying_drivers AS (
>     SELECT driver_id
>     FROM output_full
>     WHERE (
>             CASE WHEN `Mâu thuẫn lý do vs duration (M7)` THEN 1 ELSE 0 END
>           + CASE WHEN `Call log giả từ lần thử 2 (M9)` THEN 1 ELSE 0 END
>           + CASE WHEN `GPS bất thường lúc thành công (M10)` THEN 1 ELSE 0 END
>           + CASE WHEN `GPS trùng khớp giữa nhiều đơn (M11)` THEN 1 ELSE 0 END
>           + CASE WHEN `GPS mocked lúc thành công (M12)` THEN 1 ELSE 0 END
>           ) >= 2
>       AND `Điểm tổng nghi vấn` >= 10 -- (hoặc > 15 và so_don_nghi_van_cua_tai_xe >= 2 theo DOCX)
>     GROUP BY driver_id
> )
> SELECT o.*
> FROM output_full o
> INNER JOIN qualifying_drivers q ON q.driver_id = o.driver_id
> ORDER BY o.`Điểm tổng nghi vấn` DESC;
> ```

---

## 3. Data Contract gửi vào RPC Supabase

Endpoint:
```
POST https://iyjsihwgnzcytbojvoom.supabase.co/rest/v1/rpc/sync_kas_cod_suspicion_data
Headers:
  apikey: <SUPABASE_SERVICE_ROLE_KEY>
  Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
  Content-Type: application/json
```

Payload body:
```json
{
  "payload": [
    {
      "driver_id": "1002345",
      "driver_name": "Nguyễn Văn A",
      "suspicion_type": "Gối đầu COD",
      "order_code": "SPXVN012345678",
      "order_status": "delivered",
      "cod_amount": 1500000,
      "warehouse_name": "Kho Giao Hàng Nhanh Tân Bình",
      "first_delivered_date": "2026-09-10",
      "end_delivery_date": "2026-09-15",
      "return_date": null,
      "delivery_duration_days": 5.2,
      "reschedule_days_count": 2,
      "first_fail_note": "Người nhận không nghe máy",
      "total_score": 18,
      "signal_reason_conflict": true,
      "signal_fake_call": true,
      "signal_gps_far": false,
      "signal_gps_duplicate": false,
      "signal_gps_mocked": false,
      "driver_suspicious_order_count": 3,
      "success_distance_km": 1.2
    }
  ],
  "snapshot_meta": {
    "batch_id": "KAS221_20260917_0830",
    "notes": "Đồng bộ tự động StarRocks KAS-221 hàng ngày"
  }
}
```

*Lưu ý:* RPC cũng chấp nhận tên cột trực tiếp bằng tiếng Việt có dấu từ SQL gốc (như `ID tài xế`, `Mã đơn`, `Kho giao`, `Mâu thuẫn lý do vs duration (M7)`, v.v.).

---

## 4. Cấu hình n8n Workflow

Workflow n8n chạy server-side gồm 4 node chính:

1. **Schedule Trigger:**
   - Cron: `30 8 * * *` (8:30 AM hàng ngày, sau khi pipeline BI và bảng DTR sẵn sàng lúc 8:15 AM).
2. **StarRocks / MySQL Query Node:**
   - Connect tới StarRocks qua giao thức MySQL.
   - Credentials:
     - `Host`: `{{$env.STARROCKS_HOST}}`
     - `Port`: `{{$env.STARROCKS_PORT}}` (mặc định 9030)
     - `Database`: `{{$env.STARROCKS_DATABASE}}`
     - `User`: `{{$env.STARROCKS_USER}}`
     - `Password`: `{{$env.STARROCKS_PASSWORD}}`
   - Execute query: Nội dung file `01_score_model_hcm_v20_PENDING_VERIFY.sql`.
3. **Transform Code Node (JavaScript):**
   - Format mảng kết quả thành `{ payload: items.map(i => i.json), snapshot_meta: { ... } }`.
4. **HTTP Request Node (Supabase):**
   - Method: `POST`
   - URL: `https://iyjsihwgnzcytbojvoom.supabase.co/rest/v1/rpc/sync_kas_cod_suspicion_data`
   - Headers:
     - `apikey`: `{{$env.SUPABASE_SERVICE_ROLE_KEY}}`
     - `Authorization`: `Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}`
   - Body Parameters: `{{$json}}`
5. **Error Trigger / Telegram Alert Node:**
   - Bắt lỗi khi StarRocks timeout hoặc Supabase trả lỗi `>= 400`, gửi cảnh báo vào kênh vận hành KAS.

---

## 5. Hướng dẫn Chạy thử Một lần (Manual Test)

Sử dụng cURL hoặc Postman:
```bash
curl -X POST "https://iyjsihwgnzcytbojvoom.supabase.co/rest/v1/rpc/sync_kas_cod_suspicion_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": [
      {
        "driver_id": "TEST_DRV_01",
        "driver_name": "Tài xế Test 01",
        "suspicion_type": "Gối đầu COD",
        "order_code": "SPX_TEST_ORDER_01",
        "order_status": "delivered",
        "cod_amount": 2500000,
        "warehouse_name": "Kho Giao Hàng Nặng - Độc Lập - HCM",
        "first_delivered_date": "2026-09-12",
        "end_delivery_date": "2026-09-16",
        "delivery_duration_days": 4.0,
        "first_fail_note": "Người nhận không nghe máy",
        "total_score": 21,
        "signal_reason_conflict": true,
        "signal_fake_call": true,
        "signal_gps_far": false,
        "signal_gps_duplicate": false,
        "signal_gps_mocked": false
      }
    ],
    "snapshot_meta": {
      "batch_id": "MANUAL_TEST_01",
      "notes": "Kiểm thử thủ công"
    }
  }'
```

Kết quả trả về mong đợi:
```json
{
  "success": true,
  "synced_at": "2026-09-17T...",
  "batch_id": "MANUAL_TEST_01",
  "total_drivers": 1,
  "total_orders": 1
}
```
Sau đó đăng nhập app bằng tài khoản có role QC (`vinhlt@ghn.vn`) để kiểm tra dữ liệu hiển thị trên giao diện `Đơn nghi vấn COD`.
