# Đồng bộ dữ liệu KAS-221 — Đơn nghi vấn COD (Gối đầu COD & Rút ruột)

Tài liệu hướng dẫn vận hành và cấu hình pipeline đồng bộ dữ liệu từ query StarRocks KAS-221 vào Supabase project `iyjsihwgnzcytbojvoom`.

> **Điều kiện kích hoạt:** SQL `01_score_model_hcm_v20_PENDING_VERIFY.sql`, DOCX
> KAS-221 và output sample không được version trong repository này. Trước khi bật
> source job production, người vận hành phải đối chiếu alias, ngưỡng qualify và
> nhãn tín hiệu với các artifact nguồn được chủ sở hữu cung cấp. Nội dung dưới đây
> là contract triển khai, không thay thế evidence chạy query thật.

---

## 1. Nguyên tắc kiến trúc & Boundary dữ liệu

```
StarRocks DW (dtr_lastmile, online_core, iceberg)
        │
        ▼ (Scheduled server-side job: n8n workflow hoặc BI Script)
Chạy query: 01_score_model_hcm_v20_PENDING_VERIFY.sql (Grain: 1 dòng / đơn)
        │
        ▼ (Apps Script aggregate 1 đơn + nhiều SMS)
        ▼ (POST HTTPS /rest/v1/rpc/sync_kas_cod_suspicion_snapshot)
Supabase RPC (SECURITY DEFINER, TRUNCATE + INSERT trong 1 transaction)
        │
        ▼
Supabase Tables:
  - public.kas_cod_suspicion_data (Grain: 1 dòng / đơn, RLS: authenticated read-only)
  - public.kas_cod_suspicion_sms_messages (Grain: nhiều SMS / đơn, không cấp client đọc trực tiếp)
  - public.kas_cod_suspicion_metadata (Thời điểm snapshot & số lượng)
        │
        ▼ (Supabase JS Client + User Session RLS)
App React/Vite (src/components/CodSuspicionReport.jsx)
```

- **App client (trình duyệt)** tuyệt đối không kết nối trực tiếp đến StarRocks.
- Dữ liệu đồng bộ vào Supabase theo cơ chế **atomic full-refresh** tương tự như OPS KPI metric: `TRUNCATE` và `INSERT` trong cùng transaction qua RPC `sync_kas_cod_suspicion_data`.
- **Mọi user đã đăng nhập app** chỉ đọc snapshot đơn KAS-221 theo RLS. Nội dung
  SMS thô không được cấp qua Data API client; `anon` không có quyền và thao tác
  ghi/full-refresh vẫn chỉ dành cho `service_role`.
- Khi không có đơn nghi vấn nào (batch 0 dòng), RPC vẫn cập nhật `kas_cod_suspicion_metadata` với timestamp mới nhất, giúp UI hiển thị chính xác "Cập nhật lúc ... (0 đơn nghi vấn)" mà không bị crash hay hiển thị sai lệch.

---

## 2. Lưu ý về Grain và Ngưỡng trong Query StarRocks

Nếu source query hiện hành vẫn có mệnh đề chỉ chọn một dòng đại diện theo tài xế,
pipeline owner phải thay bằng output ở grain một dòng/đơn cho mọi tài xế qualify.
Mẫu dưới đây minh họa cách chuyển grain; không được áp dụng nguyên văn nếu chưa
đối chiếu SQL nguồn đang được phê duyệt:
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

Endpoint legacy (chỉ nhận source đã ở grain một dòng / đơn):
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

*Lưu ý:* RPC legacy cũng chấp nhận tên cột trực tiếp bằng tiếng Việt có dấu từ SQL gốc (như `ID tài xế`, `Mã đơn`, `Kho giao`, `Mâu thuẫn lý do vs duration (M7)`, v.v.).

### 3.1. Snapshot COD có SMS (nguồn `goi_dau_COD`)

Tab hiện tại có grain một dòng cho mỗi SMS, nên không được gửi thẳng vào RPC
legacy: một đơn có nhiều SMS sẽ làm nhân số đơn và tổng COD. Dùng script
`scripts/apps-script/sync-cod-suspicion-sms-snapshot.gs`, chạy dry-run trước,
và gọi endpoint mới:

```
POST https://iyjsihwgnzcytbojvoom.supabase.co/rest/v1/rpc/sync_kas_cod_suspicion_snapshot
```

Payload có ba field:

```json
{
  "orders": ["1 dòng canonical cho mỗi đơn"],
  "sms_messages": ["nhiều SMS đã dedupe, mỗi SMS tham chiếu đơn cha"],
  "snapshot_meta": { "batch_id": "...", "source_rows": 203 }
}
```

RPC validate toàn bộ payload trước khi `TRUNCATE`, rồi ghi cả bảng đơn và bảng
SMS trong cùng transaction. Không bật `COD_SUSPICION_GID`/nhánh COD legacy trong
`sync-to-supabase.gs` cùng lúc với script mới, vì nó có thể ghi lại snapshot ở
SMS-grain qua RPC cũ.

---

## 4. Cấu hình nguồn và lịch đồng bộ

### 4.1. Nếu dùng Google Sheet giống OPS KPI metric

Apps Script trong `scripts/apps-script/sync-to-supabase.gs` đã tham gia KAS-221
vào `syncAllTabs` (lịch hiện hữu) khi có Script Property sau:

| Script Property | Giá trị | Ý nghĩa |
|---|---|---|
| `COD_SUSPICION_GID` | GID số của tab output KAS-221 | Tab chứa output 1 dòng / đơn từ job StarRocks |

Đặt property trong Apps Script Project Settings. Không hardcode GID vào repository.
Sau khi property tồn tại, `syncAllTabs` đẩy tab này cùng lịch OPS KPI và gửi
`batch_id`/`notes` vào RPC. Nếu property chưa có, script chỉ log việc bỏ qua KAS-221;
không được hiểu là pipeline đã được kích hoạt.

### 4.2. Nếu dùng n8n chạy StarRocks trực tiếp

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

Chỉ chọn một nguồn chạy định kỳ: Apps Script **hoặc** n8n. Không kích hoạt cả hai
để tránh hai snapshot cạnh tranh nhau. Khi n8n là nguồn được chọn, không cần đặt
`COD_SUSPICION_GID`.

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
Sau đó đăng nhập app bằng một tài khoản GHN hợp lệ để kiểm tra dữ liệu hiển thị trên giao diện `Đơn nghi vấn COD`.
