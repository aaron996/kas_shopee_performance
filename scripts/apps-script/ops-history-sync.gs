/**
 * Thêm file này vào project Apps Script ~auto~ (cùng project với ops-incremental-sync.gs, dùng
 * lại opsDeltaNormalizeRows_ và opsDeltaRpc_). Ghi Pick, Deli, FD vào các bảng lịch sử
 * kas_pick_history / kas_deli_history / kas_fd_history (không bao giờ xoá theo cửa sổ).
 *
 * 1. Hằng ngày: trong syncOneTab(), dòng delegate gọi
 *      if (['pick','deli','ca1','fd'].includes(tabKey)) return syncOpsTabWithHistory_(ss,tabKey,gid);
 *    Pick/Deli/FD chạy delta như cũ, rồi upsert cả tab (Pick, Deli: D-14..D-1; FD: D-22..D-8) vào
 *    bảng lịch sử (chạy lại là no-op). CA1 chỉ chạy delta. Lỗi ở bước history làm cả tab thất bại
 *    và đi qua queue retry hiện có.
 * 2. Backfill một lần: BI ghi query hub-ngày tương ứng trong docs/sql (dòng SELECT cuối, không gộp
 *    tuần) vào tab pick_backfill_tmp / deli_backfill_tmp / fd_backfill_tmp, rồi chạy
 *    backfillPickHistory(), backfillDeliHistory(), backfillFdHistory() trong editor. Chạy lại an toàn.
 */
const OPS_HISTORY_CHUNK = 5000;
const OPS_HISTORY_BACKFILL_WEEKS = 8;
const OPS_HISTORY_BUDGET_MS = 4.5 * 60 * 1000;
const OPS_HISTORY_SPECS = {
  pick: {
    rpc: 'upsert_kas_pick_history', backfillTab: 'pick_backfill_tmp', daily: [14, 1], backfillEnd: 1,
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'hub',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},
      {name:'mau_pu',type:'numeric'},{name:'ontime_pu_1st',type:'numeric'},{name:'ontime_pu_opr',type:'numeric'}
    ]
  },
  deli: {
    rpc: 'upsert_kas_deli_history', backfillTab: 'deli_backfill_tmp', daily: [14, 1], backfillEnd: 1,
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'wh_id',type:'text'},{name:'hub',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},
      {name:'mau_deli',type:'numeric'},{name:'ontime_deli_1st',type:'numeric'},{name:'ontime_deli_odr',type:'numeric'}
    ]
  },
  fd: {
    // FD không xuất 8 ngày gần nhất: tử số cần thời gian để hình thành.
    rpc: 'upsert_kas_fd_history', backfillTab: 'fd_backfill_tmp', daily: [22, 8], backfillEnd: 8,
    columns: [
      {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'wh_id',type:'text'},{name:'deliverywh',type:'text'},
      {name:'hub_type',type:'text'},{name:'client_name',type:'text'},
      {name:'mau_fd',type:'numeric'},{name:'fd_hoan_thanh',type:'numeric'}
    ]
  }
};

function opsHistoryShift_(day, n) {
  const d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-n); return d.toISOString().slice(0,10);
}

/** Thứ Hai của tuần chứa ~day~ (khớp date_trunc('week')). */
function opsHistoryMonday_(day) {
  return opsHistoryShift_(day, (new Date(day+'T00:00:00Z').getUTCDay()+6)%7);
}

function opsHistorySpec_(tabKey) {
  const spec = OPS_HISTORY_SPECS[tabKey];
  if (!spec) throw new Error('Không có bảng lịch sử cho tab '+tabKey);
  return spec;
}

function opsHistoryRows_(spec, values, timezone) {
  if (values.length < 2) throw new Error('Tab trống hoặc chỉ có header');
  return opsDeltaNormalizeRows_(values[0].map(h => String(h).trim()),values.slice(1),spec.columns,timezone);
}

/** Gửi rows (mảng giá trị theo spec.columns) theo lô; cộng dồn kết quả RPC. */
function opsHistoryUpsert_(spec, rows, key) {
  const total = {rows:0,inserted:0,updated:0,unchanged:0};
  for (let i=0;i<rows.length;i+=OPS_HISTORY_CHUNK) {
    const objects = rows.slice(i,i+OPS_HISTORY_CHUNK).map(row => {
      const o = {}; spec.columns.forEach((c,j) => {o[c.name]=row[j];}); return o;
    });
    const result = opsDeltaRpc_(spec.rpc,{rows:objects},key);
    Object.keys(total).forEach(k => {total[k] += result[k];});
  }
  return total;
}

function opsHistoryKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

/** Hằng ngày: tab của tabKey (cửa sổ spec.daily) vào bảng lịch sử. */
function syncOpsHistoryFromTab_(ss, tabKey, gid) {
  const spec = opsHistorySpec_(tabKey);
  const key = opsHistoryKey_();
  const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
  if (!sheet) throw new Error('Không tìm thấy tab với gid '+gid);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = opsHistoryRows_(spec,sheet.getDataRange().getValues(),timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const lo = opsHistoryShift_(today,spec.daily[0]), hi = opsHistoryShift_(today,spec.daily[1]);
  const days = rows.map(r => r[0]).sort();
  if (!rows.length || days[0] < lo || days[days.length-1] > hi) {
    throw new Error(tabKey+' chưa đúng cửa sổ '+lo+'..'+hi+'; không ghi vào bảng lịch sử');
  }
  const result = opsHistoryUpsert_(spec,rows,key);
  Logger.log(JSON.stringify({tab:tabKey,mode:'history',result:result}));
}

/** Pick/Deli/FD: delta như cũ, rồi history. Tab khác (CA1): chỉ delta. */
function syncOpsTabWithHistory_(ss, tabKey, gid) {
  syncOpsDeltaTab_(ss,tabKey,gid);
  if (OPS_HISTORY_SPECS[tabKey]) syncOpsHistoryFromTab_(ss,tabKey,gid);
}

/**
 * Backfill một lần cho tabKey: đọc tab spec.backfillTab, chỉ nhận ngày từ thứ Hai cách 8 tuần trước
 * tuần hiện tại đến hôm nay trừ spec.backfillEnd (Pick, Deli: hôm qua; FD: D-8), nếu có ngày ngoài
 * khoảng thì từ chối cả tab. Gửi từng tuần. Log tổng nguồn theo tuần để đối chiếu với bảng sau khi
 * chạy. Hết ngân sách thời gian thì dừng và báo chạy lại.
 */
function backfillOpsHistory_(tabKey) {
  const started = Date.now();
  const spec = opsHistorySpec_(tabKey);
  const key = opsHistoryKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(spec.backfillTab);
  if (!sheet) throw new Error('Không thấy tab '+spec.backfillTab);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = opsHistoryRows_(spec,sheet.getDataRange().getValues(),timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const lo = opsHistoryShift_(opsHistoryMonday_(today),OPS_HISTORY_BACKFILL_WEEKS*7), hi = opsHistoryShift_(today,spec.backfillEnd);
  const outside = rows.filter(r => r[0] < lo || r[0] > hi);
  if (!rows.length || outside.length) {
    throw new Error('Tab backfill có '+outside.length+' dòng ngoài cửa sổ '+lo+'..'+hi+'; không ghi gì');
  }
  const weeks = {};
  rows.forEach(r => {const w = opsHistoryMonday_(r[0]); (weeks[w] = weeks[w] || []).push(r);});
  const order = Object.keys(weeks).sort(), summary = [], done = [];
  order.forEach(week => {
    const item = {week_start:week,rows:weeks[week].length};
    spec.columns.forEach((c,j) => {
      if (c.type === 'numeric') item[c.name] = weeks[week].reduce((a,r) => a+(r[j]||0),0);
    });
    summary.push(item);
  });
  Logger.log(tabKey+' nguồn theo tuần: '+JSON.stringify(summary));
  for (let i=0;i<order.length;i++) {
    if (Date.now()-started > OPS_HISTORY_BUDGET_MS) {
      Logger.log(JSON.stringify({tab:tabKey,partial:true,done:done,remaining:order.slice(i),note:'Chạy lại hàm backfill này'}));
      return;
    }
    const result = opsHistoryUpsert_(spec,weeks[order[i]],key);
    done.push(order[i]);
    Logger.log(JSON.stringify({tab:tabKey,week_start:order[i],result:result}));
  }
  Logger.log(JSON.stringify({tab:tabKey,partial:false,weeks:done.length,rows:rows.length}));
}

function backfillPickHistory() { backfillOpsHistory_('pick'); }
function backfillDeliHistory() { backfillOpsHistory_('deli'); }
function backfillFdHistory() { backfillOpsHistory_('fd'); }
