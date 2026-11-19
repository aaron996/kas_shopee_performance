/**
 * KAS-314 (ĐỀ XUẤT, chưa chạy lên Supabase): đẩy 1st Deli / ODR theo lane vào kas_deli_lane_daily.
 *
 * Thêm file này vào project Apps Script ~auto~ (cùng project với ops-incremental-sync.gs, dùng lại
 * opsDeltaNormalizeRows_, opsDeltaRpc_ và SUPABASE_URL). Mẫu theo ops-history-sync.gs.
 *
 * Quy trình:
 * 1. BI chạy query lane (docs/sql/deli_lane_daily_202610_test.sql, đổi kỳ sang cửa sổ cần đẩy) và dán
 *    kết quả (header: report_date, lane, client_name, hub_type, mau_deli, ontime_deli_1st,
 *    ontime_deli_odr) vào tab ~lane_deli_tmp~.
 * 2. Chạy ~dryRunLaneDeli()~: chỉ đọc và kiểm, KHÔNG gọi Supabase; log tổng theo client + theo tuần để
 *    đối chiếu với deli_weekly_60d_test.sql (cùng kỳ phải khớp mau_deli / 1st / ODR theo client).
 * 3. Sau khi được duyệt và migration 20261118090000_kas_deli_lane_daily.sql đã chạy: ~syncLaneDeli()~.
 *    Gửi từng tuần qua RPC upsert_kas_deli_lane_daily. Chạy lại an toàn (no-op khi số không đổi).
 *
 * Khác ops-history-sync.gs: RPC lane trả {received, changed}, không phải {inserted, updated, unchanged},
 * nên không dùng lại opsHistoryUpsert_ (cộng dồn khoá khác sẽ ra NaN).
 */
const LANE_DELI_TAB = 'lane_deli_tmp';
const LANE_DELI_RPC = 'upsert_kas_deli_lane_daily';
const LANE_DELI_CHUNK = 5000; // RPC giới hạn 20000 dòng/lô
const LANE_DELI_WEEKS = 8;
const LANE_DELI_BUDGET_MS = 4.5 * 60 * 1000;
const LANE_DELI_CLIENTS = ['SPB', 'SPE'];
const LANE_DELI_COLUMNS = [
  {name:'report_date',type:'date'},{name:'lane',type:'text'},{name:'client_name',type:'text'},
  {name:'hub_type',type:'text'},
  {name:'mau_deli',type:'numeric'},{name:'ontime_deli_1st',type:'numeric'},{name:'ontime_deli_odr',type:'numeric'}
];

function laneDeliShift_(day, n) {
  const d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-n); return d.toISOString().slice(0,10);
}

/** Thứ Hai của tuần chứa ~day~ (khớp date_trunc('week')). */
function laneDeliMonday_(day) {
  return laneDeliShift_(day, (new Date(day+'T00:00:00Z').getUTCDay()+6)%7);
}

/** Đọc tab, chuẩn hoá và kiểm tra. Trả {rows, today, timezone}. Ném lỗi nếu dữ liệu không đạt. */
function laneDeliLoad_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LANE_DELI_TAB);
  if (!sheet) throw new Error('Không thấy tab '+LANE_DELI_TAB);
  const timezone = ss.getSpreadsheetTimeZone();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Tab trống hoặc chỉ có header');
  const rows = opsDeltaNormalizeRows_(values[0].map(h => String(h).trim()),values.slice(1),LANE_DELI_COLUMNS,timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const lo = laneDeliShift_(laneDeliMonday_(today),LANE_DELI_WEEKS*7), hi = laneDeliShift_(today,1);
  const outside = rows.filter(r => r[0] < lo || r[0] > hi);
  if (!rows.length || outside.length) {
    throw new Error('Tab có '+outside.length+' dòng ngoài cửa sổ '+lo+'..'+hi+'; không ghi gì');
  }
  // lane và client bắt buộc; client chỉ SPB/SPE. Lane rỗng làm RPC bỏ dòng im lặng nên chặn ở đây.
  const bad = rows.filter(r => !String(r[1]||'').trim() || !LANE_DELI_CLIENTS.includes(r[2]));
  if (bad.length) throw new Error(bad.length+' dòng thiếu lane hoặc client ngoài SPB/SPE; không ghi gì');
  // Khoá (ngày, lane, client, hub_type) phải duy nhất, nếu không RPC ghi đè nhau.
  const seen = new Set();
  rows.forEach(r => {
    const k = [r[0],String(r[1]).trim().toLowerCase(),r[2],r[3]].join('|');
    if (seen.has(k)) throw new Error('Trùng khoá '+k+'; không ghi gì');
    seen.add(k);
  });
  rows.forEach(r => {r[1] = String(r[1]).trim();});
  return {rows:rows,today:today,timezone:timezone,lo:lo,hi:hi};
}

/** Tổng nguồn theo client và theo tuần, để đối chiếu với query tuần / bảng sau khi ghi. */
function laneDeliSummary_(rows) {
  const byClient = {}, byWeek = {};
  rows.forEach(r => {
    [[byClient,r[2]],[byWeek,laneDeliMonday_(r[0])+'|'+r[2]]].forEach(pair => {
      const bucket = pair[0], key = pair[1];
      const t = bucket[key] = bucket[key] || {rows:0,mau_deli:0,ontime_deli_1st:0,ontime_deli_odr:0};
      t.rows++; t.mau_deli += r[4]||0; t.ontime_deli_1st += r[5]||0; t.ontime_deli_odr += r[6]||0;
    });
  });
  return {byClient:byClient,byWeek:byWeek};
}

/** Chỉ kiểm tra và log, không gọi Supabase. */
function dryRunLaneDeli() {
  const data = laneDeliLoad_();
  Logger.log(JSON.stringify({dryRun:true,rows:data.rows.length,window:data.lo+'..'+data.hi,summary:laneDeliSummary_(data.rows)}));
}

function laneDeliUpsert_(rows, key) {
  const total = {received:0,changed:0};
  for (let i=0;i<rows.length;i+=LANE_DELI_CHUNK) {
    const objects = rows.slice(i,i+LANE_DELI_CHUNK).map(row => {
      const o = {}; LANE_DELI_COLUMNS.forEach((c,j) => {o[c.name]=row[j];}); return o;
    });
    const result = opsDeltaRpc_(LANE_DELI_RPC,{rows:objects},key);
    total.received += result.received; total.changed += result.changed;
  }
  return total;
}

/** Ghi từng tuần. Hết ngân sách thời gian thì dừng và báo chạy lại. */
function syncLaneDeli() {
  const started = Date.now();
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  const data = laneDeliLoad_();
  Logger.log('lane nguồn: '+JSON.stringify(laneDeliSummary_(data.rows)));
  const weeks = {};
  data.rows.forEach(r => {const w = laneDeliMonday_(r[0]); (weeks[w] = weeks[w] || []).push(r);});
  const order = Object.keys(weeks).sort(), done = [];
  for (let i=0;i<order.length;i++) {
    if (Date.now()-started > LANE_DELI_BUDGET_MS) {
      Logger.log(JSON.stringify({partial:true,done:done,remaining:order.slice(i),note:'Chạy lại syncLaneDeli'}));
      return;
    }
    const result = laneDeliUpsert_(weeks[order[i]],key);
    if (result.received !== weeks[order[i]].length) {
      throw new Error('RPC nhận '+result.received+' dòng, gửi '+weeks[order[i]].length+' (tuần '+order[i]+')');
    }
    done.push(order[i]);
    Logger.log(JSON.stringify({week_start:order[i],result:result}));
  }
  Logger.log(JSON.stringify({partial:false,weeks:done.length,rows:data.rows.length}));
}
