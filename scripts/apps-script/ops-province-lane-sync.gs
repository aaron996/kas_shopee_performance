/**
 * KAS-317: đẩy các dòng chi tiết province (và lane) sang kas_pick_detail / kas_deli_detail /
 * kas_fd_detail / kas_reverse_detail. Thêm file này vào project Apps Script ~auto~ (dùng lại
 * opsDeltaNormalizeRows_, opsDeltaRpc_, opsHistoryShift_, opsHistoryKey_).
 *
 * Được gọi tự động từ syncOpsTabWithHistory_ (Pick, Deli, FD) và syncReverseHistory (Reverse) sau khi
 * luồng cũ (delta + history) đã thành công. Chỉ ghi các cột CỘNG ĐƯỢC; benchmark không đi vào đây.
 *
 * - Giai đoạn chuyển tiếp: header chưa có cột province (Deli/FD: province và lane) thì bỏ qua, không lỗi.
 * - Cửa sổ ngày như luồng cũ: Pick/Deli/Reverse D-14..D-1, FD D-22..D-8, phải có đủ ngày cuối cửa sổ.
 *   Sai cửa sổ thì không ghi gì và báo lỗi.
 * - Upsert, không xoá; dòng province/lane không còn trong nguồn vẫn được giữ (cùng chính sách bảng history).
 *   Hai dòng cùng (hub, client, province, lane) trong một lô là lỗi nguồn: RPC từ chối cả lô.
 */
const OPS_DETAIL_CHUNK = 5000;
const OPS_DETAIL_SPECS = {
  pick: {
    rpc: 'upsert_kas_pick_detail', daily: [14, 1], requires: ['province'],
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'hub',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},{name:'province',type:'text'},
      {name:'mau_pu',type:'numeric'},{name:'ontime_pu_1st',type:'numeric'},{name:'ontime_pu_opr',type:'numeric'}
    ]
  },
  deli: {
    rpc: 'upsert_kas_deli_detail', daily: [14, 1], requires: ['province', 'lane'],
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'wh_id',type:'text'},{name:'hub',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},{name:'province',type:'text'},{name:'lane',type:'text'},
      {name:'mau_deli',type:'numeric'},{name:'ontime_deli_1st',type:'numeric'},{name:'ontime_deli_odr',type:'numeric'}
    ]
  },
  fd: {
    rpc: 'upsert_kas_fd_detail', daily: [22, 8], requires: ['province', 'lane'],
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'wh_id',type:'text'},{name:'deliverywh',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},{name:'province',type:'text'},{name:'lane',type:'text'},
      {name:'mau_fd',type:'numeric'},{name:'fd_hoan_thanh',type:'numeric'}
    ]
  },
  reverse: {
    rpc: 'upsert_kas_reverse_detail', daily: [14, 1], requires: ['province'],
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'hub',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},{name:'province',type:'text'},
      {name:'mau_pu',type:'numeric'},{name:'ontime_pu_1st',type:'numeric'},{name:'ontime_pu_opr',type:'numeric'},
      {name:'pud',type:'numeric'},{name:'mau_pud',type:'numeric'}
    ]
  }
};

/** Dòng chi tiết theo spec.columns; null nếu header chưa đủ cột province/lane. province/lane rỗng -> null. */
function opsDetailRows_(spec, values, timezone) {
  if (values.length < 2) return null;
  const headers = values[0].map(h => String(h).trim());
  if (spec.requires.some(name => headers.indexOf(name) < 0)) return null;
  const rows = opsDeltaNormalizeRows_(headers,values.slice(1),spec.columns,timezone);
  spec.columns.forEach((c,j) => {
    if (c.name !== 'province' && c.name !== 'lane') return;
    rows.forEach(r => {const v = r[j] === null ? '' : String(r[j]).trim(); r[j] = v || null;});
  });
  return rows;
}

/** Kiểm tra cửa sổ rồi upsert theo lô. Trả tổng kết RPC. */
function opsDetailUpsert_(tabKey, spec, rows, today, key) {
  const lo = opsHistoryShift_(today,spec.daily[0]), hi = opsHistoryShift_(today,spec.daily[1]);
  const days = rows.map(r => r[0]).sort();
  if (!rows.length || days[0] < lo || days[days.length-1] !== hi) {
    throw new Error(tabKey+' chưa đúng cửa sổ '+lo+'..'+hi+'; không ghi vào bảng chi tiết');
  }
  const total = {rows:0,written:0,unchanged:0};
  for (let i=0;i<rows.length;i+=OPS_DETAIL_CHUNK) {
    const objects = rows.slice(i,i+OPS_DETAIL_CHUNK).map(row => {
      const o = {}; spec.columns.forEach((c,j) => {o[c.name]=row[j];}); return o;
    });
    const result = opsDeltaRpc_(spec.rpc,{date_from:lo,date_to:hi,rows:objects},key);
    Object.keys(total).forEach(k => {total[k] += result[k];});
  }
  return total;
}

/** Một sheet (Pick, Deli, FD, Reverse) vào bảng chi tiết. Header chưa có province/lane thì bỏ qua. */
function syncOpsDetailFromSheet_(tabKey, sheet, timezone, key) {
  const spec = OPS_DETAIL_SPECS[tabKey];
  if (!spec) return;
  const rows = opsDetailRows_(spec,sheet.getDataRange().getValues(),timezone);
  if (!rows) {
    Logger.log(JSON.stringify({tab:tabKey,mode:'detail',skipped:'header chưa có '+spec.requires.join('/')}));
    return;
  }
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const result = opsDetailUpsert_(tabKey,spec,rows,today,key);
  Logger.log(JSON.stringify({tab:tabKey,mode:'detail',sourceRows:rows.length,result:result}));
}

/** Pick/Deli/FD: gọi từ syncOpsTabWithHistory_ sau delta và history. CA1 không có bảng chi tiết. */
function syncOpsDetailFromTab_(ss, tabKey, gid) {
  if (!OPS_DETAIL_SPECS[tabKey]) return;
  const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
  if (!sheet) throw new Error('Không tìm thấy tab với gid '+gid);
  syncOpsDetailFromSheet_(tabKey,sheet,ss.getSpreadsheetTimeZone(),opsHistoryKey_());
}
