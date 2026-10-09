/**
 * Đồng bộ 5 tab (Pick / Deli / Ca1 / Leadtime / FD) của Google Sheet nguồn vào 5
 * bảng Supabase dạng quan hệ bình thường (kas_pick_data / kas_deli_data /
 * kas_ca1_data / kas_leadtime_data / kas_fd_data, mỗi tab 1 bảng, mỗi dòng sheet
 * 1 dòng SQL), thay cho cách app đọc trực tiếp link CSV public ("Anyone with
 * link can view") — cách đó đã bị chặn khi GHN tắt share ra ngoài domain.
 *
 * Mỗi lần chạy gọi 1 hàm SQL (sync_kas_pick_data / sync_kas_deli_data /
 * sync_kas_ca1_data / sync_kas_leadtime_data / sync_kas_fd_data) làm full-refresh
 * atomic (xoá hết rồi insert lại trong 1 transaction) — không upsert theo key vì
 * data thật không có cột nào là unique key tự nhiên.
 *
 * Vì script này chạy NGAY TRONG chính file Sheet (Extensions > Apps Script),
 * dưới quyền của người sở hữu/đang mở file, nó đọc được dữ liệu bất kể sheet
 * có share public hay không — không phụ thuộc chính sách share-ra-ngoài.
 *
 * === CÀI ĐẶT (làm 1 lần) ===
 * 1. Mở Google Sheet nguồn → Extensions → Apps Script.
 * 2. Xoá nội dung mẫu, dán toàn bộ nội dung file này vào.
 * 3. Project Settings (icon bánh răng) → Script Properties → Add script
 *    property:
 *      - Property: SUPABASE_SERVICE_ROLE_KEY
 *      - Value: <lấy trong Supabase Dashboard > Project Settings > API >
 *                service_role secret key> — KHÔNG hardcode key vào code.
 * 4. Chạy hàm `syncAllTabs` một lần thủ công (Run) để cấp quyền
 *    (Authorize access) — cần cấp quyền đọc Sheet hiện tại + gọi URL ngoài.
 * 5. Chạy hàm `createDailyTrigger` một lần (Run) để tự tạo trigger 1 lần/ngày.
 *    KHÔNG tạo trigger qua UI (Triggers > Add Trigger > Day timer) — kiểu
 *    "Day timer, 8am to 9am" của UI chỉ hứa chạy TRONG khung giờ đó, có thể
 *    rơi vào 8:01AM (trước khi BI kịp đổ data lúc 8:15) mà không có cách nào
 *    ghim giờ chính xác hơn từ UI. `createDailyTrigger` dùng `nearMinute()`
 *    để ghim giờ chạy gần đúng MIN_RUN_HOUR:MIN_RUN_MINUTE hơn nhiều.
 *    Nếu trước đó đã lỡ tạo trigger qua UI, hàm này cũng tự xoá trigger cũ
 *    của syncAllTabs trước khi tạo trigger mới, để không bị chạy trùng.
 * 6. Xong — mỗi ngày trigger tự chạy 1 lần; app đọc live từ Supabase (không
 *    cần đăng nhập gì thêm). Muốn đổi lại chạy nhiều lần/ngày thì tự thêm
 *    trigger như cũ, guard giờ chạy ở dưới vẫn sẽ chặn các lần chạy quá sớm.
 *
 * Muốn chạy tay lại RIÊNG 1 tab (vd chỉ test/fix lại tab FD sau khi đổi cột
 * trên Sheet, không muốn đẩy lại cả 4 tab kia): chọn hàm tương ứng ở dropdown
 * trên cùng của Apps Script editor rồi bấm Run — syncPickOnly / syncDeliOnly /
 * syncCa1Only / syncLeadtimeOnly / syncFdOnly. Các hàm này chạy ngay, không
 * bị chặn bởi guard giờ MIN_RUN_HOUR:MIN_RUN_MINUTE (khác với syncAllTabs).
 *
 * Muốn đổi Spreadsheet ID / gid các tab thì sửa các hằng số ngay dưới đây.
 */

const SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';

// BI đổ data về Sheet lúc 8h15 mỗi ngày — chừa thêm buffer, không chạy sync
// trước giờ này. Đây là chốt chặn Ở CODE, độc lập với trigger: dù trigger có
// lỡ chạy sớm (jitter của Apps Script, hoặc ai đó bấm Run tay để test) thì
// sync vẫn không đẩy data cũ/thiếu lên Supabase.
const MIN_RUN_HOUR = 8;
const MIN_RUN_MINUTE = 30;

// Các gid tab hiện tại.
// gid ổn định hơn tên tab — đổi tên tab không làm hỏng script, chỉ đổi gid
// (ví dụ nếu tab bị xoá & tạo lại) mới cần sửa lại các số này.
const TAB_GIDS = {
  pick: 1312031199,
  deli: 940798880,
  ca1: 1405399014,
  leadtime: 396308004,
  fd: 1207390624
};

// Mỗi tab ứng với 1 hàm RPC full-refresh riêng trong Supabase
const TAB_RPC_FUNCTIONS = {
  pick: 'sync_kas_pick_data',
  deli: 'sync_kas_deli_data',
  ca1: 'sync_kas_ca1_data',
  leadtime: 'sync_kas_leadtime_data',
  fd: 'sync_kas_fd_data'
};

/**
 * Tạo trigger chạy `syncAllTabs` 1 lần/ngày, ghim gần đúng
 * MIN_RUN_HOUR:MIN_RUN_MINUTE (chính xác hơn UI Trigger vốn chỉ chọn được cả
 * khung giờ, vd "8am to 9am"). Chạy hàm này 1 LẦN thủ công lúc cài đặt — nó
 * tự xoá trigger cũ của syncAllTabs trước khi tạo trigger mới, nên chạy lại
 * bao nhiêu lần cũng không bị tạo trùng.
 *
 * Lưu ý: Apps Script không hứa chạy chính xác tuyệt đối tới từng phút — chỉ
 * đảm bảo chạy trong khoảng ~15 phút kể từ nearMinute. Đây là lý do vẫn cần
 * chốt chặn ở isBeforeRunWindow_() bên dưới làm lớp bảo vệ thứ 2.
 */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ['syncAllTabs', 'syncAllTabsAfterRunWindow'].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncAllTabs')
    .timeBased()
    .atHour(MIN_RUN_HOUR)
    .nearMinute(MIN_RUN_MINUTE)
    .everyDays(1)
    .inTimezone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone())
    .create();

  Logger.log('Đã tạo trigger syncAllTabs chạy 1 lần/ngày, gần ' + MIN_RUN_HOUR + ':' + MIN_RUN_MINUTE + '.');
}

/**
 * true nếu thời điểm hiện tại (theo timezone của Sheet) còn TRƯỚC
 * MIN_RUN_HOUR:MIN_RUN_MINUTE — tức là chưa nên sync (BI có thể chưa đổ data
 * xong lúc 8h15).
 */
function isBeforeRunWindow_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz, 'H'));
  const minute = Number(Utilities.formatDate(now, tz, 'm'));
  return hour < MIN_RUN_HOUR || (hour === MIN_RUN_HOUR && minute < MIN_RUN_MINUTE);
}

function syncAllTabs(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (isBeforeRunWindow_(ss)) {
    if (e && e.triggerUid) {
      const tz = ss.getSpreadsheetTimeZone();
      const now = new Date();
      const hour = Number(Utilities.formatDate(now, tz, 'H'));
      const minute = Number(Utilities.formatDate(now, tz, 'm'));
      const second = Number(Utilities.formatDate(now, tz, 's'));
      const delayMs = ((MIN_RUN_HOUR - hour) * 3600 + (MIN_RUN_MINUTE - minute) * 60 - second + 1) * 1000;
      ScriptApp.getProjectTriggers()
        .filter((t) => t.getHandlerFunction() === 'syncAllTabsAfterRunWindow')
        .forEach((t) => ScriptApp.deleteTrigger(t));
      ScriptApp.newTrigger('syncAllTabsAfterRunWindow').timeBased().after(delayMs).create();
      Logger.log('Đã hẹn chạy lại syncAllTabs sau mốc 08:30.');
    }
    Logger.log(
      'Bỏ qua lần chạy này: mới ' +
      Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'HH:mm') +
      ', còn trước ' + MIN_RUN_HOUR + ':' + (MIN_RUN_MINUTE < 10 ? '0' : '') + MIN_RUN_MINUTE +
      ' — BI có thể chưa đổ data về Sheet xong.'
    );
    return;
  }

  startOpsSync_(Object.keys(TAB_GIDS));
}

/**
 * Chạy tay 1 tab riêng lẻ, KHÔNG qua guard giờ chạy (isBeforeRunWindow_) —
 * dùng khi cần test/fix lại đúng 1 tab (vd sau khi đổi cột trên Sheet hoặc
 * sửa RPC function) mà không muốn đẩy lại toàn bộ 4 tab còn lại. Chọn đúng
 * tên hàm tương ứng ở dropdown trên cùng của Apps Script editor rồi bấm Run.
 *
 * Chạy tay cũng dùng cùng queue/lock/retry; khi lỗi tạm thời sẽ tạo trigger
 * một lần để tiếp tục. Tab đã thành công không bị gửi lại trong cùng job.
 * Lịch hằng ngày vẫn do createDailyTrigger quản lý; đổi giờ bằng
 * MIN_RUN_HOUR / MIN_RUN_MINUTE ở đầu file.
 */
function syncPickOnly() {
  startOpsSync_(['pick']);
}

function syncDeliOnly() {
  startOpsSync_(['deli']);
}

function syncCa1Only() {
  startOpsSync_(['ca1']);
}

function syncLeadtimeOnly() {
  startOpsSync_(['leadtime']);
}

function syncFdOnly() {
  startOpsSync_(['fd']);
}

function syncOneTab(ss, tabKey, gid, rpcFunctionName) {
  if (['pick','deli','ca1','fd'].includes(tabKey)) return syncOpsDeltaTab_(ss,tabKey,gid);
  const sheet = ss.getSheets().find((s) => s.getSheetId() === gid);
  if (!sheet) {
    throw new Error('Không tìm thấy tab với gid ' + gid);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('Tab trống hoặc chỉ có header');
  }

  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1)
    // Bỏ các dòng hoàn toàn rỗng (thường do format kéo dài quá header)
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = row[i];
        // Chuẩn hoá Date object của Apps Script về "yyyy-MM-dd" cho các cột ngày,
        // để khớp định dạng report_date mà app đang parse (parseToLocal trong
        // src/utils/dataProcessor.js).
        obj[h] = cell instanceof Date
          ? Utilities.formatDate(cell, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
          : cell;
      });
      return obj;
    });

  if (!rows.length) throw new Error('Tab không có dòng dữ liệu; giữ nguyên snapshot cũ.');
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Header trống hoặc trùng; giữ nguyên snapshot cũ.');

  const serviceKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  }

  // Gọi hàm SQL full-refresh (xoá hết + insert lại trong 1 transaction) —
  // tên tham số "payload" phải khớp đúng tên tham số của hàm SQL
  // sync_kas_*_data(payload jsonb).
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + rpcFunctionName, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey
    },
    payload: JSON.stringify({ payload: rows }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code >= 300) {
    const body = res.getContentText();
    const error = new Error('Supabase HTTP ' + code + ': ' + body.slice(0, 800));
    let sqlCode = '';
    try { sqlCode = JSON.parse(body).code || ''; } catch (_) {}
    error.retryable = [408,429,502,503,504].includes(code) ||
      (code >= 500 && (!sqlCode || /^(08|53|57)/.test(sqlCode) || ['40001','40P01','55P03'].includes(sqlCode)));
    const responseHeaders = res.getAllHeaders();
    const retryAfterName = Object.keys(responseHeaders).find(name => name.toLowerCase() === 'retry-after');
    if (retryAfterName) {
      const value = String(responseHeaders[retryAfterName]);
      const delay = /^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now();
      if (Number.isFinite(delay) && delay > 0) error.retryAfterMs = Math.min(delay, 60*60*1000);
    }
    throw error;
  }

  Logger.log(tabKey + ': đã đẩy ' + rows.length + ' dòng lên Supabase (bảng kas_' + tabKey + '_data).');
}


/** Retry only when the daily trigger arrived before 08:30. */
function syncAllTabsAfterRunWindow(e) {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncAllTabsAfterRunWindow')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  syncAllTabs(e);
}

/** Run once to apply all three daily schedules without syncing data. */
function resetThreeDailyTriggers0830() {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (tz !== 'Asia/Ho_Chi_Minh' && tz !== 'Asia/Saigon') {
    throw new Error('Đặt timezone của Sheet về Việt Nam; hiện tại: ' + tz);
  }
  createDailyTrigger();
  createCodSmsDailyTrigger();
  installDailyTrigger();
  Logger.log('Đã đổi cả 3 lịch về gần 08:30 hằng ngày, timezone ' + tz + '.');
  const counts = {};
  ScriptApp.getProjectTriggers().forEach((t) => {
    const handler = t.getHandlerFunction();
    counts[handler] = (counts[handler] || 0) + 1;
  });
  Logger.log(JSON.stringify(counts));
}

// Durable, bounded retry queue for OPS KPI only. Each execution sends one tab.
const OPS_SYNC_STATE_KEY = 'OPS_KPI_SYNC_STATE_V1';
const OPS_SYNC_RETRY_HANDLER = 'retrySyncAllTabs';
const OPS_SYNC_MAX_ATTEMPTS = 4;
const OPS_SYNC_GAP_MS = 60 * 1000;
const OPS_SYNC_WATCHDOG_MS = 7 * 60 * 1000;

function startOpsSync_(keys) {
  runOpsSyncQueue_(keys, false);
}

/** One-shot continuation; resumes only the unfinished tabs of today's job. */
function retrySyncAllTabs() {
  runOpsSyncQueue_(null, true);
}

/** Read-only status; does not print credentials or source rows. */
function showOpsSyncStatus() {
  const raw = PropertiesService.getScriptProperties().getProperty(OPS_SYNC_STATE_KEY);
  Logger.log(raw || 'No OPS sync job recorded.');
}

function opsSyncIsRetryable_(error) {
  if (typeof error.retryable === 'boolean') return error.retryable;
  const message = String(error.message || error);
  // Permanent daily/size/access limits need intervention, not an automatic loop.
  if (/per day|for one day|daily quota|POST size|response size|permission|not authorized|authorization required/i.test(message)) return false;
  return /bandwidth quota exceeded|timed? ?out|timeout|temporar|connection|network|socket|DNS|service unavailable|internal error|in a short time|too many times per second|try again|try reducing the rate/i.test(message);
}

function opsSyncRetryDelay_(attempts) {
  return Math.min(20, 5 * Math.pow(2, attempts - 1)) * 60 * 1000;
}

function opsSyncNewState_(day, keys, now) {
  return {version:1, day:day, startedAt:now, updatedAt:now,
    pending:keys.map(key => ({key:key, attempts:0, nextAt:now})), completed:[], failed:[]};
}

/** At most one tab per execution; persist the attempt before any remote side effect. */
function opsSyncStep_(state, execute, save, clock) {
  const now = clock();
  // A previous execution may have been forcibly timed out before recording its outcome.
  state.pending = state.pending.filter(item => {
    if (item.attempts < OPS_SYNC_MAX_ATTEMPTS) return true;
    state.failed.push({key:item.key, attempts:item.attempts, error:'Retry limit reached after interrupted execution.'});
    return false;
  });
  const item = state.pending.find(entry => entry.nextAt <= now);
  if (!item) { state.updatedAt = now; save(state); return; }
  item.attempts++;
  item.nextAt = now + OPS_SYNC_WATCHDOG_MS;
  state.updatedAt = now;
  save(state);
  try {
    execute(item.key);
    state.completed.push(item.key);
    state.pending = state.pending.filter(entry => entry !== item);
  } catch (error) {
    const message = String(error.message || error).slice(0, 800);
    if (opsSyncIsRetryable_(error) && item.attempts < OPS_SYNC_MAX_ATTEMPTS) {
      item.nextAt = clock() + Math.max(opsSyncRetryDelay_(item.attempts), Number(error.retryAfterMs) || 0);
      item.lastError = message;
      Logger.log('OPS retry queued: ' + item.key + ', attempt ' + item.attempts + '/' + OPS_SYNC_MAX_ATTEMPTS + ': ' + message);
    } else {
      state.failed.push({key:item.key, attempts:item.attempts, error:message});
      state.pending = state.pending.filter(entry => entry !== item);
    }
  }
  state.updatedAt = clock();
  save(state);
}

function replaceOpsSyncRetryTrigger_(delayMs) {
  // Create before deleting old triggers so a create failure cannot erase recovery.
  const existing = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === OPS_SYNC_RETRY_HANDLER);
  const replacement = ScriptApp.newTrigger(OPS_SYNC_RETRY_HANDLER).timeBased()
    .after(Math.max(OPS_SYNC_GAP_MS, delayMs)).create();
  existing.forEach(t => ScriptApp.deleteTrigger(t));
  return replacement;
}

function clearOpsSyncRetryTriggers_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === OPS_SYNC_RETRY_HANDLER)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function runOpsSyncQueue_(keys, resumeOnly) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    if (resumeOnly) replaceOpsSyncRetryTrigger_(5*60*1000);
    Logger.log('OPS sync is already running; this overlapping invocation was skipped.');
    return;
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const raw = props.getProperty(OPS_SYNC_STATE_KEY);
    let state = raw ? JSON.parse(raw) : null;
    if (resumeOnly && (!state || state.day !== day || !state.pending.length)) {
      clearOpsSyncRetryTriggers_();
      Logger.log('No unfinished OPS tabs for today; stale retry was removed.');
      return;
    }
    if (!state || state.day !== day || !state.pending.length) {
      state = opsSyncNewState_(day, keys, Date.now());
    } else if (keys && keys.length === 1 && !state.pending.some(item => item.key === keys[0])) {
      throw new Error('An OPS job is already pending. Wait for completion before starting a separate tab.');
    }
    const save = value => props.setProperty(OPS_SYNC_STATE_KEY, JSON.stringify(value));
    save(state);
    // Install recovery BEFORE reading Sheet/calling RPC, since hard timeouts bypass catch/finally.
    replaceOpsSyncRetryTrigger_(OPS_SYNC_WATCHDOG_MS);
    opsSyncStep_(state, key => {
      if (!Object.prototype.hasOwnProperty.call(TAB_GIDS, key)) {
        const error = new Error('Unknown OPS tab: ' + key); error.retryable = false; throw error;
      }
      syncOneTab(ss, key, TAB_GIDS[key], TAB_RPC_FUNCTIONS[key]);
    }, save, () => Date.now());
    if (state.pending.length) {
      const delay = Math.max(OPS_SYNC_GAP_MS, Math.min(...state.pending.map(item => item.nextAt)) - Date.now());
      replaceOpsSyncRetryTrigger_(delay);
      Logger.log('OPS progress: ' + JSON.stringify({completed:state.completed,failed:state.failed,pending:state.pending.map(item => ({key:item.key,attempts:item.attempts,nextAt:item.nextAt})),nextRunAfterSeconds:Math.ceil(delay/1000)}));
    } else {
      clearOpsSyncRetryTriggers_();
      Logger.log('OPS finished: ' + JSON.stringify({day:state.day,completed:state.completed,failed:state.failed}));
    }
    if (state.failed.length) throw new Error('OPS tabs requiring attention: ' + state.failed.map(item => item.key + ': ' + item.error).join(' | '));
  } finally {
    lock.releaseLock();
  }
}

/** Read-only logic checks; no source reads, RPC calls or queue/property changes. */
function verifyOpsSyncRetry() {
  let checks = 0;
  function check(ok, label) { if (!ok) throw new Error('Retry test failed: '+label); checks++; }
  let now = 1000;
  let writes = [];
  const save = state => writes.push(JSON.parse(JSON.stringify(state)));
  const clock = () => now;
  let state = opsSyncNewState_('2026-10-09',['pick','deli'],now);
  const calls = [];
  opsSyncStep_(state,key => { calls.push(key); check(writes[writes.length-1].pending[0].attempts===1,'persist before RPC'); },save,clock);
  check(calls.join(',')==='pick' && state.completed.join(',')==='pick' && state.pending.length===1,'one tab per execution');
  opsSyncStep_(state,key => calls.push(key),save,clock);
  check(calls.join(',')==='pick,deli' && state.pending.length===0,'completed tabs not repeated');
  state=opsSyncNewState_('2026-10-09',['pick','deli'],now);
  opsSyncStep_(state,() => {throw new Error('Bandwidth quota exceeded: Try reducing the rate of data transfer.');},save,clock);
  check(state.pending[0].attempts===1 && state.pending[0].nextAt===now+300000,'bandwidth deferred 5 min');
  opsSyncStep_(state,key => check(key==='deli','only eligible tab runs'),save,clock);
  check(state.completed.join(',')==='deli','other tab continues');
  let ran=false;
  opsSyncStep_(state,() => {ran=true;},save,clock);
  check(!ran,'retry waits until due');
  now+=300000;
  opsSyncStep_(state,() => {throw new Error('Connection timed out');},save,clock);
  check(state.pending[0].attempts===2 && state.pending[0].nextAt===now+600000,'second retry 10 min');
  now+=600000;
  opsSyncStep_(state,() => {throw new Error('Connection timed out');},save,clock);
  check(state.pending[0].nextAt===now+1200000,'third retry 20 min');
  now+=1200000;
  opsSyncStep_(state,() => {throw new Error('Connection timed out');},save,clock);
  check(!state.pending.length && state.failed[0].attempts===4,'bounded at four total attempts');
  state=opsSyncNewState_('2026-10-09',['pick'],now);
  opsSyncStep_(state,() => {const error=new Error('HTTP 401'); error.retryable=false; throw error;},save,clock);
  check(!state.pending.length && state.failed.length===1,'permanent errors stop');
  state=opsSyncNewState_('2026-10-09',['pick'],now);
  state.pending[0].attempts=4;
  opsSyncStep_(state,() => {throw new Error('Should not run');},save,clock);
  check(!state.pending.length && state.failed.length===1,'hard timeout cap');
  state=opsSyncNewState_('2026-10-09',['pick'],now);
  opsSyncStep_(state,() => {const error=new Error('HTTP 429');error.retryable=true;error.retryAfterMs=1800000;throw error;},save,clock);
  check(state.pending[0].nextAt===now+1800000,'Retry-After honored');
  check(!opsSyncIsRetryable_(new Error('Service invoked too many times per day')),'daily quotas not retried');
  check(!opsSyncIsRetryable_(new Error('Missing header')),'data errors not retried');
  check(opsSyncIsRetryable_(new Error('Service invoked too many times in a short time')),'short service quotas retried');
  Logger.log(JSON.stringify({retryChecksPassed:checks,policy:'one tab per execution; 5/10/20 minute retries; maximum 4 attempts'}));
}


function opsDeltaMd5_(text) {
  const bytes = unescape(encodeURIComponent(text));
  const words = new Array(((bytes.length+8 >>> 6)+1)*16).fill(0);
  for (let i=0;i<bytes.length;i++) words[i>>>2] |= bytes.charCodeAt(i) << ((i%4)*8);
  words[bytes.length>>>2] |= 128 << ((bytes.length%4)*8);
  words[words.length-2] = bytes.length*8;
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  for (let offset=0;offset<words.length;offset+=16) {
    let a=a0,b=b0,c=c0,d=d0;
    for (let i=0;i<64;i++) {
      let f,g;
      if(i<16){f=(b&c)|(~b&d);g=i;}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}
      else if(i<48){f=b^c^d;g=(3*i+5)%16;}
      else {f=c^(b|~d);g=(7*i)%16;}
      const sum=(a+f+(Math.floor(Math.abs(Math.sin(i+1))*4294967296)|0)+words[offset+g])|0;
      const shift=shifts[(i>>>4)*4+i%4];
      a=d;d=c;c=b;b=(b+((sum<<shift)|(sum>>>(32-shift))))|0;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return [a0,b0,c0,d0].map(n=>[0,8,16,24].map(s=>('0'+((n>>>s)&255).toString(16)).slice(-2)).join('')).join('');
}

function opsDeltaDayManifest_(columns, rows, dateColumn, md5) {
  const dayIndex = columns.findIndex(c => c.name === dateColumn);
  if (dayIndex < 0) throw new Error('Missing date column in OPS schema');
  const groups = {};
  rows.forEach(row => {
    const day = row[dayIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw new Error('Invalid OPS report date');
    const canonical = '[' + row.map(v => JSON.stringify(v === null ? null : String(v))).join(', ') + ']';
    if (!groups[day]) groups[day] = {rows:[], hashes:[]};
    groups[day].rows.push(row); groups[day].hashes.push(md5(canonical));
  });
  const days = Object.keys(groups).sort().map(day => ({day:day, count:groups[day].rows.length,
    hash:md5(groups[day].hashes.sort().join('\n'))}));
  return {days:days,groups:groups};
}
function opsDeltaNormalizeRows_(headers, values, columns, timezone) {
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Header trống hoặc trùng');
  const indexes = columns.map(c => {
    const index = headers.indexOf(c.name);
    if (index < 0 && c.name !== 'wh_id') throw new Error('Missing header: '+c.name);
    if (!['date','numeric','text'].includes(c.type)) throw new Error('Unsupported OPS column type: '+c.type);
    return index;
  });
  return values.filter(row => row.some(cell => cell !== '' && cell !== null)).map(row => columns.map((c,i) => {
    const value = indexes[i] < 0 ? null : row[indexes[i]];
    if (c.type === 'date') {
      const raw = value instanceof Date ? Utilities.formatDate(value,timezone,'yyyy-MM-dd') : String(value || '').trim();
      const day = /^\d{4}-\d{2}-\d{2}[ T]00:00:00(?:\.0+)?$/.test(raw) ? raw.slice(0,10) : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day+'T00:00:00Z').toISOString().slice(0,10) !== day) throw new Error('Invalid date: '+c.name);
      return day;
    }
    if (c.type === 'numeric') {
      if (value === '' || value === null || value === undefined) return null;
      const number = Number(value);
      if (typeof value === 'boolean' || !Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER || !/^-?\d+(\.\d+)?$/.test(String(number))) throw new Error('Invalid numeric: '+c.name);
      return number;
    }
    if (value === null || value === undefined) return null;
    return c.name === 'wh_id' ? (String(value).trim() || null) : String(value);
  }));
}
function opsDeltaValidateWindow_(tabKey, days, today) {
  const offset = tabKey === 'fd' ? [22,8] : [14,1];
  const shift = n => {const d = new Date(today+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-n); return d.toISOString().slice(0,10);};
  const lo = shift(offset[0]), hi = shift(offset[1]);
  if (!days.length || days.some(d => d.day < lo || d.day > hi) || days[days.length-1].day !== hi) {
    throw new Error('Source chưa đúng cửa sổ '+lo+'..'+hi+'; giữ nguyên snapshot cũ');
  }
}
function opsDeltaRpc_(rpc, payload, serviceKey) {
  const res = UrlFetchApp.fetch(SUPABASE_URL+'/rest/v1/rpc/'+rpc, {
    method:'post', contentType:'application/json',
    headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},
    payload:JSON.stringify(payload), muteHttpExceptions:true
  });
  const status = res.getResponseCode(), body = res.getContentText();
  if (status >= 300) {
    const error = new Error('Supabase HTTP '+status+': '+body.slice(0,800));
    let sqlCode = ''; try {sqlCode = JSON.parse(body).code || '';} catch (_) {}
    error.retryable = [408,429,502,503,504].includes(status) ||
      (status >= 500 && (!sqlCode || /^(08|53|57)/.test(sqlCode) || ['40001','40P01','55P03'].includes(sqlCode))) ||
      ['40001','40P01','55P03'].includes(sqlCode);
    const headers = res.getAllHeaders();
    const name = Object.keys(headers).find(k => k.toLowerCase() === 'retry-after');
    if (name) {
      const value = String(headers[name]);
      const delay = /^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now();
      if (Number.isFinite(delay) && delay > 0) error.retryAfterMs = Math.min(delay,3600000);
    }
    throw error;
  }
  return JSON.parse(body);
}
function syncOpsDeltaTab_(ss,tabKey,gid) {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
  if (!sheet) throw new Error('Không tìm thấy tab với gid '+gid);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Tab trống hoặc chỉ có header; giữ nguyên snapshot cũ');
  const remote = opsDeltaRpc_('ops_kpi_sync_manifest',{tab_key:tabKey},key);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = opsDeltaNormalizeRows_(values[0].map(h => String(h).trim()),values.slice(1),remote.columns,timezone);
  const source = opsDeltaDayManifest_(remote.columns,rows,remote.date_column,opsDeltaMd5_);
  opsDeltaValidateWindow_(tabKey,source.days,Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd'));
  const previous = {};
  remote.days.forEach(d => {previous[d.day]=d;});
  const changed = source.days.filter(d => !previous[d.day] || previous[d.day].hash !== d.hash || previous[d.day].count !== d.count);
  const removed = remote.days.filter(d => !source.groups[d.day]);
  if (!changed.length && !removed.length) {
    Logger.log(JSON.stringify({tab:tabKey,mode:'delta',sourceRows:rows.length,transferredRows:0,inserted:0,deleted:0,unchanged:true}));
    return;
  }
  const changedRows = [].concat(...changed.map(d => source.groups[d.day].rows));
  const payload = {tab_key:tabKey,base_token:remote.token,source_days:source.days,changed_rows:changedRows};
  const result = opsDeltaRpc_('sync_ops_kpi_delta',payload,key);
  const objectRows = rows.map(row => {const o={};remote.columns.forEach((c,i)=>{o[c.name]=row[i];});return o;});
  const bytes = value => Utilities.newBlob(JSON.stringify(value)).getBytes().length;
  Logger.log(JSON.stringify({tab:tabKey,mode:'delta',sourceRows:rows.length,transferredRows:changedRows.length,
    changedDates:changed.map(d=>d.day),removedDates:removed.map(d=>d.day),
    payloadBytes:bytes(payload),equivalentFullObjectBytes:bytes({payload:objectRows}),result:result}));
}
function syncOptimizedOpsTabs() { startOpsSync_(['pick','deli','ca1','fd']); }
