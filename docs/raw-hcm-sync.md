# Raw → HCM: ghi nhận thay đổi ngày 09/10/2026

Đây là luồng tạo request HCM, tách biệt với sync OPS → Supabase.

- [Sheet nguồn raw/hcm](https://docs.google.com/spreadsheets/d/1oFXxTUGPzwgRrvIxZttqaeaELU6K9klr55uSuToixGw/edit).
- [Sheet result để kiểm tra request đã thành công](https://docs.google.com/spreadsheets/d/1SnpBjAKF2BbHGatYGDVnxm-lvkNHFgCKYLr0p0wCvOU/edit).
- [Project Apps Script](https://script.google.com/u/1/home/projects/1KIr8zFVqoCI6kjMKUUmC2L_Qkz8dDSoeSHeanBxLyA4q5h3NhqXRVRyX/edit).

## Quyết định và thay đổi

Người dùng đã sửa query tab raw để chỉ lấy đơn mới mỗi ngày. Vì vậy đã bỏ
dedup theo ngày, dedup trong batch và việc ghi/đọc `request_sync_history` ở các
script liên quan HCM; tab history đã được xóa theo yêu cầu.

Giữ bước kiểm tra trùng với tab **result**: bỏ qua đơn đã có request trạng thái
**Thành công** và có ticket. Không coi mọi dòng result, kể cả lỗi/chưa có ticket,
là lý do bỏ qua đơn. Raw lấy đơn mới là điều kiện nguồn do người dùng xác nhận,
không phải kết luận rằng mọi query KPI đều đã chốt dữ liệu ngày cũ.

## Bằng chứng và giới hạn

Trong phiên làm việc 09/10 đã kiểm tra luồng thực tế: 151 dòng raw → 13 dòng HCM,
bỏ qua 4 dòng đã thành công trong result → còn 9 request. Các số này là snapshot
của lần kiểm tra, không phải số lượng cố định hằng ngày.

Note này lưu lại kết quả và phạm vi đã sửa trong cùng cuộc trao đổi. Không có
bản export mã nguồn project HCM trong commit này; không dùng Code.gs của project
auto OPS để ghi đè project HCM. Chưa thực hiện thêm chỉnh sửa hoặc chạy lại HCM
khi ghi tài liệu/push repo.
