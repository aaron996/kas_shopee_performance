# Dự báo thời tiết trong Tổng quan

Nguồn đã chọn: **WeatherAPI.com**. Đây là công cụ cho team nhỏ theo yêu cầu người dùng, không cần gói Business chỉ vì tên dashboard có “vận hành GHN”.

Gói Free tại thời điểm kiểm tra 14/10/2026: 100.000 lượt gọi/tháng, dự báo 3 ngày theo giờ và cho phép personal/commercial use. Dữ liệu Free cần ghi nguồn WeatherAPI.com; giao diện đã có link nguồn. Không dùng Bulk API (Free chưa hỗ trợ).

## Cấu hình

Frontend luôn có panel trừ khi `VITE_WEATHER_ENABLED=false`. API cần:

```dotenv
WEATHER_ENABLED=true
WEATHERAPI_KEY=<key từ tài khoản WeatherAPI.com>
SUPABASE_URL=<giá trị server hiện có>
SUPABASE_ANON_KEY=<giá trị server hiện có>
SUPABASE_SERVICE_ROLE_KEY=<giá trị server hiện có>
WEATHER_CACHE_REST_URL=<HTTPS Redis REST endpoint>
WEATHER_CACHE_REST_TOKEN=<write token cache>
```

Giữ key provider và token cache ở server secrets. Không thêm prefix `VITE_`. Adapter không gửi key hoặc thông báo lỗi thô của provider tới browser. Khi chưa có key hoặc bật flag, giao diện hiển thị chưa cấu hình; KPI vẫn hoạt động.

Cache REST dùng protocol Upstash Redis, không thêm SDK. Cache theo điểm công khai, TTL mới 30 phút, fallback tối đa 2 giờ, lock ngắn 12 giây và chống request trùng trong instance. Production yêu cầu cache chung để kiểm soát quota; local/test có thể dùng cache memory trong instance. Cache lỗi không tự bỏ qua để spam provider. Hai điểm × 48 lần/ngày × 30 ngày = khoảng 2.880 calls/tháng nếu liên tục có người xem, cache chung bình thường. Không phải cam kết quota: cold starts/mapping mới/cache miss có thể làm số thực khác.

## Contract dữ liệu

Gọi `forecast.json?days=2&aqi=no&alerts=no&lang=vi` cho từng điểm, tuần tự. Dùng `time_epoch` làm đầu giờ và khoảng kết thúc +1 giờ; đây là forecast row hourly của WeatherAPI, không dùng quy tắc giờ trước timestamp của Open-Meteo. `precip_mm` là lượng giáng thủy và `chance_of_rain` là khả năng mưa; không gộp hai đại lượng. Null là thiếu dữ liệu, 0 là không mưa. Nhiệt độ hiện tại dùng `current.temp_c` với `last_updated_epoch`; không gọi thời điểm lấy request là thời điểm cập nhật mô hình.

Mọi timestamp DTO là ISO UTC; UI format `Asia/Ho_Chi_Minh`, không phụ thuộc timezone thiết bị. Hiện 12 hoặc 24 giờ còn hiệu lực; mobile xem từng đoạn 4 giờ có hit target ít nhất 44px. Bộ lọc KPI và ngày KPI không thay thời gian forecast.

## Giao diện thu gọn và mở rộng

Card mặc định thu gọn: địa điểm đang chọn, nhiệt độ hiện tại khi có dữ liệu và tóm tắt mưa. Nguồn WeatherAPI.com, thời điểm lấy dữ liệu, thời điểm cập nhật nhiệt độ và nhãn điểm đại diện thành phố vẫn hiện khi thu gọn. Nút “Xem dự báo” mở nội dung ngay trong card; “Thu gọn” đóng lại. Nút dùng `aria-expanded` và `aria-controls` trỏ tới ID do `useId` tạo; vùng chi tiết dùng `hidden`. Mở/đóng chỉ đổi trạng thái giao diện, không tự làm mới dự báo.

Phần mở rộng chứa biểu đồ lượng mưa 12/24 giờ, chi tiết giờ được chọn và phân trang 4 giờ trên mobile. Gợi ý vị trí, chọn điểm và ghim nằm trong mục lồng “Địa điểm và gợi ý vị trí”. Thông báo tải/lỗi/cấu hình, dự báo đã lưu hoặc hết hạn và danh sách vùng chưa có điểm nằm ngoài vùng bị ẩn, nên vẫn truy cập được khi thu gọn. Nếu có giờ thiếu lượng mưa và các giờ còn lại đều là 0, tóm tắt báo chưa đủ dữ liệu; không suy ra toàn kỳ không mưa.

Card dùng nền xanh atmospheric riêng trong cả light/dark; các phần tử con kế thừa màu chữ và bề mặt cục bộ. Đây là thay đổi trình bày, không đổi provider, backend, phạm vi địa lý hay contract dữ liệu.

## Điểm pilot và phạm vi

Registry `src/data/weatherLocations.js` chứa điểm đại diện TP.HCM và Hà Nội, nguồn GeoNames kiểm tra ngày 14/10/2026. HCM/HNO và các nhánh KA/CK tương ứng dùng chung điểm thành phố; nhãn luôn nói “điểm đại diện”, chưa phải tọa độ từng Hub hoặc toàn tỉnh mới sau sáp nhập. Các vùng khác, bao gồm GXT theo miền, hiển thị chưa có điểm. Chưa thêm Đà Nẵng: mock ban đầu dùng NTB nhưng source hiện tại đặt Đà Nẵng trong TTB, cần mapping vận hành hiện hành được chốt trước khi mở rộng.

Ứng dụng hiện cấp toàn bộ vùng báo cáo cho email đã được phép đăng nhập, chưa có ACL địa bàn riêng từng tài khoản. API xác minh JWT với Supabase Auth và allowlist hiện tại trước cache/provider, kiểm tra tập điểm trong selectedRegions; không coi lựa chọn vùng từ client là một ACL mới. Khi bổ sung region ACL về sau phải intersect server-side trước lookup cache. Không dùng user_metadata để tạo quyền.

Client/loại Hub chỉ thay KPI; thời tiết độc lập khi tập điểm không đổi. Phạm vi rỗng không gọi provider. Lỗi tại một điểm có thể giữ điểm khác thành công. Provider bị hết quota hoặc key sai trả trạng thái có thể hiểu được.

## Vị trí người dùng

Sau intro và chọn Client, user bấm “Dùng vị trí của tôi” mới gọi geolocation một lần (`enableHighAccuracy:false`, timeout 8 giây, maximumAge 5 phút). Không dùng watchPosition, IP lookup, reverse geocoder hoặc gửi GPS user tới provider.

Tọa độ browser chỉ dùng tính điểm công khai gần nhất, rồi bị bỏ đi. Gợi ý chứa ID điểm, khoảng cách và accuracy; người dùng phải bấm dùng card để chọn. Không tuyên bố điểm gần nhất chính là tỉnh, vùng hoặc dự báo chính xác tại vị trí user. GPS quá cũ/không hợp lệ/độ bất định làm không xác định được điểm gần nhất chuyển sang chọn tay. Gợi ý ngoài vùng không tự đổi bộ lọc. Manual selection và dismiss hủy kết quả của request định vị đang chờ.

Session storage chỉ lưu ID điểm, source manual/nearby, các ID ghim và trạng thái để sau; không GPS. “Ngừng dùng vị trí” bỏ source nearby; không thể thu hồi permission hệ thống từ JavaScript, user làm trong cài đặt browser nếu cần. Sign-out/đổi tài khoản xóa preference.

`vercel.json` cho dashboard `geolocation=(self)`, auth callback vẫn `geolocation=()`. Chỉ có thể xin quyền thực trên HTTPS/secure context và sau user permission. Parent cross-origin cần policy cho dashboard origin + iframe `allow="geolocation"`; không sửa parent trong repo này. Nếu bị policy/OS/browser chặn, app vẫn cho chọn tay. Không coi mọi PERMISSION_DENIED là vừa từ chối prompt.

## Delivery và rollback

Giới hạn gợi ý vị trí của pilot: TP.HCM 25 km, Hà Nội 20 km, tính cả sai số GPS; sai số lớn hơn 5 km chuyển sang chọn tay. Đây là ngưỡng UX thận trọng để tránh gợi ý một thành phố cách hàng trăm km, **không phải độ phủ khí tượng hoặc ranh giới hành chính**. Chỉ gợi ý điểm công khai và yêu cầu người dùng chọn. Nếu browser hỗ trợ Permissions API, app quan sát quyền bị thu hồi và bỏ chế độ nearby; không gọi GPS khi quan sát quyền. UI cũng bỏ forecast đã lấy quá 2 giờ dù các hàng thời gian vẫn ở tương lai.

Đã cấu hình WeatherAPI key và Upstash Redis Free `ghn-weather-cache` vào `.env.local` (gitignored) và Vercel Production qua IAB ngày 14/10/2026. Forecast thật TP.HCM trả 24 giờ; hai loader riêng xác nhận lần thứ hai dùng cache Redis chung, chỉ gọi provider một lần. Không có migration. `/api/weather` được rewrite vào function `chat-suggestions` với dispatcher riêng cho thời tiết; không gọi AI/quota chatbot. Handler riêng ở `server/weather/handler.js`; repo giữ 12 API functions kể cả `api/cron/*`. Kiểm tra alias từ deployment sau deploy.

Tắt `WEATHER_ENABLED` để dừng upstream; tắt `VITE_WEATHER_ENABLED` và rebuild để ẩn panel. Không có DB migration. Không thay logic export hay target KPI.

Nguồn: [Pricing](https://www.weatherapi.com/pricing.aspx), [Forecast](https://www.weatherapi.com/docs/forecast-api/), [API errors](https://www.weatherapi.com/docs/error-codes/), [Terms](https://www.weatherapi.com/terms.aspx), [Redis REST](https://upstash.com/docs/redis/features/restapi).

## Kiểm chứng local

- Toàn bộ suite Node, lint phần thay đổi và Vite production build.
- Component thật trong Codex built-in browser, fixture provider/geolocation: success, stale, lỗi, thiếu cấu hình, từ chối vị trí, điểm ngoài phạm vi, chọn tay trong lúc định vị pending, 12/24 giờ, paging mobile, ghim địa điểm.
- 390px/320px, light/dark: không tràn ngang; nút giờ mobile >=44px.
- Tổng quan thật với local UI preview: qua intro và chọn client, panel vẫn xuất hiện khi KPI chưa có dữ liệu. Preview không tạo Supabase session và không đọc weather API thật.
- Đã kiểm tra forecast WeatherAPI thật và đọc/ghi cache Redis thật bằng adapter server. Chưa có bằng chứng JWT production, rewrite Vercel đã deploy hoặc hộp quyền vị trí thật trên thiết bị; cần kiểm tra riêng sau deployment.
