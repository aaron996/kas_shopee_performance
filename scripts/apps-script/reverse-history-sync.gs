/**
 * KAS-291: ghi SPE Reverse (client 224845) vào bảng kas_reverse_history. Thêm file này vào project Apps Script ~auto~ (dùng lại
 * opsDeltaNormalizeRows_ và opsDeltaRpc_ của ops-incremental-sync.gs, opsHistoryShift_/opsHistoryMonday_/opsHistoryKey_ của
 * ops-history-sync.gs).
 *
 * 1. Backfill một lần: BI ghi kết quả docs/sql/pick_reverse_backfill_20260621.sql vào tab reverse_backfill_tmp (header đúng tên
 *    cột của SELECT cuối), rồi chạy backfillReverseHistory(). Chỉ nhận ngày từ 2026-06-21 đến hôm qua, có ngày ngoài khoảng
 *    thì từ chối cả tab. Mỗi tuần một lệnh replace (xoá rồi chèn đúng các ngày của tuần đó) nên chạy lại an toàn.
 * 2. Hằng ngày: BI ghi kết quả docs/sql/pick_reverse_14d.sql vào tab reverse, đặt trigger hằng ngày cho syncReverseHistory().
 *    Replace D-14..D-1 trong bảng lịch sử (khác Pick: dòng nào không còn trong nguồn thì bị xoá). Nguồn phải có đủ ngày hôm
 *    qua và không có ngày ngoài cửa sổ, nếu không thì không ghi gì.
 */
const REVERSE_TAB = 'reverse';
const REVERSE_BACKFILL_TAB = 'reverse_backfill_tmp';
const REVERSE_BACKFILL_START = '2026-06-21';
const REVERSE_DAILY_DAYS = 14;
const REVERSE_BUDGET_MS = 4.5 * 60 * 1000;
const REVERSE_COLUMNS = [
  {name:'report_date',type:'date'},{name:'region',type:'text'},{name:'hub',type:'text'},
  {name:'hub_type',type:'text'},{name:'client_name',type:'text'},
  {name:'mau_pu',type:'numeric'},{name:'ontime_pu_1st',type:'numeric'},{name:'ontime_pu_opr',type:'numeric'},
  {name:'pud',type:'numeric'}
];

/** Một lệnh replace cho [from, to] với rows (mảng giá trị theo REVERSE_COLUMNS). */
function reverseReplaceWindow_(from, to, rows, key) {
  const objects = rows.map(row => {
    const o = {}; REVERSE_COLUMNS.forEach((c,j) => {o[c.name]=row[j];}); return o;
  });
  return opsDeltaRpc_('replace_kas_reverse_history',{date_from:from,date_to:to,rows:objects},key);
}

function reverseRows_(sheet, timezone) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Tab '+sheet.getName()+' trống hoặc chỉ có header');
  return opsDeltaNormalizeRows_(values[0].map(h => String(h).trim()),values.slice(1),REVERSE_COLUMNS,timezone);
}

/** Hằng ngày: replace D-14..D-1 từ tab reverse. */
function syncReverseHistory() {
  const key = opsHistoryKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVERSE_TAB);
  if (!sheet) throw new Error('Không thấy tab '+REVERSE_TAB);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = reverseRows_(sheet,timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const lo = opsHistoryShift_(today,REVERSE_DAILY_DAYS), hi = opsHistoryShift_(today,1);
  const days = rows.map(r => r[0]).sort();
  if (days[0] < lo || days[days.length-1] !== hi) {
    throw new Error('Tab '+REVERSE_TAB+' chưa đúng cửa sổ '+lo+'..'+hi+' (nguồn '+days[0]+'..'+days[days.length-1]+'); không ghi gì');
  }
  const result = reverseReplaceWindow_(lo,hi,rows,key);
  Logger.log(JSON.stringify({tab:REVERSE_TAB,mode:'daily',window:[lo,hi],result:result}));
}

/** Backfill một lần từ tab reverse_backfill_tmp, từng tuần. Hết ngân sách thời gian thì dừng và báo chạy lại. */
function backfillReverseHistory() {
  const started = Date.now();
  const key = opsHistoryKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVERSE_BACKFILL_TAB);
  if (!sheet) throw new Error('Không thấy tab '+REVERSE_BACKFILL_TAB);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = reverseRows_(sheet,timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const lo = REVERSE_BACKFILL_START, hi = opsHistoryShift_(today,1);
  const outside = rows.filter(r => r[0] < lo || r[0] > hi);
  if (outside.length) {
    throw new Error('Tab backfill có '+outside.length+' dòng ngoài cửa sổ '+lo+'..'+hi+'; không ghi gì');
  }
  const weeks = {};
  rows.forEach(r => {const w = opsHistoryMonday_(r[0]); (weeks[w] = weeks[w] || []).push(r);});
  const order = Object.keys(weeks).sort(), summary = [], done = [];
  order.forEach(week => {
    const item = {week_start:week,rows:weeks[week].length};
    REVERSE_COLUMNS.forEach((c,j) => {
      if (c.type === 'numeric') item[c.name] = weeks[week].reduce((a,r) => a+(r[j]||0),0);
    });
    summary.push(item);
  });
  Logger.log('reverse nguồn theo tuần: '+JSON.stringify(summary));
  for (let i=0;i<order.length;i++) {
    if (Date.now()-started > REVERSE_BUDGET_MS) {
      Logger.log(JSON.stringify({tab:REVERSE_BACKFILL_TAB,partial:true,done:done,remaining:order.slice(i),note:'Chạy lại backfillReverseHistory()'}));
      return;
    }
    const monday = order[i], sunday = opsHistoryShift_(monday,-6);
    const from = monday < lo ? lo : monday, to = sunday > hi ? hi : sunday;
    const result = reverseReplaceWindow_(from,to,weeks[monday],key);
    done.push(monday);
    Logger.log(JSON.stringify({tab:REVERSE_BACKFILL_TAB,week_start:monday,window:[from,to],result:result}));
  }
  Logger.log(JSON.stringify({tab:REVERSE_BACKFILL_TAB,partial:false,weeks:done.length,rows:rows.length}));
}
