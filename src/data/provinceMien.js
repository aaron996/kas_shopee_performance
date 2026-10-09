// Tỉnh/thành → Miền, dùng để biết một kho GXT ("Kho Giao Hàng Nặng - <quận> -
// <tỉnh>") nằm ở Miền nào. Cột `region` của dòng GXT là vùng của ĐƠN, không phải
// vị trí kho (kho "Tân Tạo - HCM" có dòng ở cả DSH, HNO, TTB), nên Miền phải suy
// từ tỉnh ở cuối tên kho. Tên kho vẫn dùng tên tỉnh cũ (trước sáp nhập).
//
// Miền khớp với MIEN_REGIONS: Tây Nguyên (TNG) và Nam Trung Bộ (NTB) thuộc Miền
// Trung. Bình Thuận → Trung (NTB), Lâm Đồng → Trung (TNG); đổi ở đây nếu GHN
// xếp khác.
const PROVINCES_BY_MIEN = {
  'Miền Bắc': [
    'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Giang', 'Bắc Ninh', 'Hải Dương', 'Hưng Yên',
    'Thái Bình', 'Nam Định', 'Hà Nam', 'Ninh Bình', 'Vĩnh Phúc', 'Phú Thọ', 'Thái Nguyên',
    'Bắc Kạn', 'Cao Bằng', 'Lạng Sơn', 'Tuyên Quang', 'Hà Giang', 'Lào Cai', 'Yên Bái',
    'Điện Biên', 'Lai Châu', 'Sơn La', 'Hòa Bình'
  ],
  'Miền Trung': [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Huế',
    'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 'Ninh Thuận',
    'Bình Thuận', 'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'
  ],
  'Miền Nam': [
    'Hồ Chí Minh', 'HCM', 'TP HCM', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Vũng Tàu', 'BRVT',
    'Tây Ninh', 'Bình Phước', 'Long An', 'Tiền Giang', 'Bến Tre', 'Vĩnh Long', 'Trà Vinh',
    'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Cần Thơ', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'
  ]
};

// "Đắk Lắk" → "dak lak": bỏ dấu, đ → d, chỉ giữ chữ/số, gộp khoảng trắng.
export function normalizePlaceName(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Dài trước, để "ba ria vung tau" thắng "vung tau" khi cả hai cùng khớp đuôi.
const PROVINCE_KEYS = Object.entries(PROVINCES_BY_MIEN)
  .flatMap(([mien, names]) => names.map(name => ({ key: normalizePlaceName(name), mien })))
  .sort((a, b) => b.key.length - a.key.length);

// Miền của tỉnh nằm ở cuối `hubName`, hoặc null nếu không nhận ra tỉnh nào.
// Khớp theo ranh giới từ ở cuối tên: "…- Nhà Bè - HCM" ra HCM.
export function mienFromHubName(hubName) {
  const text = normalizePlaceName(hubName);
  if (!text) return null;
  const hit = PROVINCE_KEYS.find(({ key }) => text === key || text.endsWith(` ${key}`));
  return hit ? hit.mien : null;
}
