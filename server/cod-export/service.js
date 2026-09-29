import { createClient } from '@supabase/supabase-js';
import { ChatError, toPublicError } from '../chat/errors.js';
import { DEFAULT_SMS_ESCALATION_THRESHOLD } from '../../src/utils/codSuspicionProcessor.js';
import { buildCodSuspicionExportRows, EXPORT_HEADERS, selectNewLogRows } from './build.js';
import { createSheetsClient, fetchAccessToken, parseServiceAccount } from './google-sheets.js';

export const DEFAULT_EXPORT_SPREADSHEET_ID = '1KPxEdtmu-s3yKpjOjJ4yEV1YnIjfTF9qcI0u_4ecCdk';
export const DEFAULT_EXPORT_SHEET = 'nghi_ngo_COD';
export const DEFAULT_EXPORT_LOG_SHEET = 'nghi_ngo_COD_log';

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const LAST_COLUMN = String.fromCharCode('A'.charCodeAt(0) + EXPORT_HEADERS.length - 1);

const ORDER_COLUMNS = [
  'suspicion_type', 'driver_id', 'driver_name', 'order_code', 'to_province',
  'warehouse_id', 'warehouse_name', 'cod_amount', 'end_delivery_date', 'total_score'
].join(',');

function requireEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new ChatError('COD_EXPORT_CONFIG_MISSING', `Chưa cấu hình ${key} cho export sheet COD.`, 503);
  return value;
}

/** Returns null when the Google credential is not set, so callers can skip. */
export function readCodExportConfig(env = process.env) {
  const rawServiceAccount = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawServiceAccount) return null;
  const sheetName = env.COD_EXPORT_SHEET_NAME?.trim() || DEFAULT_EXPORT_SHEET;
  const logSheetName = env.COD_EXPORT_LOG_SHEET_NAME?.trim() || DEFAULT_EXPORT_LOG_SHEET;
  if (sheetName === logSheetName) {
    throw new ChatError('COD_EXPORT_CONFIG_INVALID', 'Tab ghi đè và tab log phải khác nhau.', 503);
  }
  return {
    supabaseUrl: requireEnv(env, 'SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    serviceAccount: parseServiceAccount(rawServiceAccount),
    spreadsheetId: env.COD_EXPORT_SPREADSHEET_ID?.trim() || DEFAULT_EXPORT_SPREADSHEET_ID,
    sheetName,
    logSheetName
  };
}

async function selectAll(buildQuery, code, message) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new ChatError(code, message, 503, { cause: error });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  throw new ChatError(code, `${message} (vượt ${MAX_PAGES * PAGE_SIZE} dòng)`, 503);
}

export function createCodExportRepository(serviceClient) {
  return {
    loadOrders() {
      return selectAll(
        () => serviceClient.from('kas_cod_suspicion_data').select(ORDER_COLUMNS).order('id', { ascending: true }),
        'COD_EXPORT_SOURCE_READ_FAILED', 'Không thể đọc snapshot đơn COD.'
      );
    },
    loadScoredAssessments() {
      return selectAll(
        () => serviceClient.from('cod_suspicion_sms_assessments')
          .select('suspicion_type,driver_id,order_code,status,sms_score')
          .eq('status', 'scored')
          .order('id', { ascending: true }),
        'COD_EXPORT_ASSESSMENT_READ_FAILED', 'Không thể đọc điểm SMS.'
      );
    },
    loadNonViolationDrivers() {
      return selectAll(
        () => serviceClient.from('cod_suspicion_driver_resolutions')
          .select('suspicion_type,driver_id')
          .eq('finding_outcome', 'non_violation')
          .order('id', { ascending: true }),
        'COD_EXPORT_RESOLUTION_READ_FAILED', 'Không thể đọc kết luận xử lý tài xế.'
      );
    },
    async loadThreshold() {
      const { data, error } = await serviceClient.from('cod_sms_escalation_config')
        .select('threshold').eq('id', true).maybeSingle();
      if (error) throw new ChatError('COD_EXPORT_THRESHOLD_READ_FAILED', 'Không thể đọc mốc điểm SMS.', 503, { cause: error });
      return data?.threshold ?? DEFAULT_SMS_ESCALATION_THRESHOLD;
    }
  };
}

export function formatVietnamTimestamp(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Create missing tabs and grow the overwrite tab so the full table fits. */
async function prepareSheets(sheets, { sheetName, logSheetName, neededRows }) {
  const existing = await sheets.getSheets();
  const byTitle = new Map(existing.map(sheet => [sheet.title, sheet]));
  const requests = [];
  for (const title of [sheetName, logSheetName]) {
    if (!byTitle.has(title)) requests.push({ addSheet: { properties: { title } } });
  }
  const target = byTitle.get(sheetName);
  if (target && (target.gridProperties?.rowCount ?? 0) < neededRows) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: target.sheetId, gridProperties: { rowCount: neededRows } },
        fields: 'gridProperties.rowCount'
      }
    });
  }
  if (requests.length) await sheets.batchUpdate(requests);
  // A tab created just now has the default 1000-row grid.
  if (!target && neededRows > 1000) {
    const created = (await sheets.getSheets()).find(sheet => sheet.title === sheetName);
    await sheets.batchUpdate([{
      updateSheetProperties: {
        properties: { sheetId: created.sheetId, gridProperties: { rowCount: neededRows } },
        fields: 'gridProperties.rowCount'
      }
    }]);
  }
}

/**
 * Push Medium/High COD suspicion orders to the destination spreadsheet:
 *   - `sheetName` is fully rewritten with the current list.
 *   - `logSheetName` only gains orders whose (type, order code) it has never
 *     seen, so a later change to SMS/call fields never adds a second row.
 * Safe to re-run: both writes are idempotent for the same snapshot.
 */
export async function runCodSuspicionExport(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const config = (dependencies.readConfig ?? readCodExportConfig)(env);
  if (!config) {
    return { status: 'skipped', reason: 'GOOGLE_SERVICE_ACCOUNT_JSON chưa được cấu hình.' };
  }

  const serviceClient = dependencies.serviceClient ?? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const repository = (dependencies.createRepository ?? createCodExportRepository)(serviceClient);
  const [orders, assessments, nonViolationDrivers, threshold] = await Promise.all([
    repository.loadOrders(),
    repository.loadScoredAssessments(),
    repository.loadNonViolationDrivers(),
    repository.loadThreshold()
  ]);

  const syncedAt = formatVietnamTimestamp(dependencies.now ?? new Date());
  const rows = buildCodSuspicionExportRows({ orders, assessments, nonViolationDrivers, threshold, syncedAt });

  const sheets = dependencies.sheetsClient ?? createSheetsClient({
    accessToken: await fetchAccessToken(config.serviceAccount),
    spreadsheetId: config.spreadsheetId
  });

  const table = [EXPORT_HEADERS.slice(), ...rows];
  await prepareSheets(sheets, { ...config, neededRows: table.length });
  await sheets.updateValues(config.sheetName, 'A1', table);
  await sheets.clearValues(config.sheetName, `A${table.length + 1}:${LAST_COLUMN}`);

  const existingLog = await sheets.getValues(config.logSheetName, `A:${LAST_COLUMN}`);
  const newLogRows = selectNewLogRows(rows, existingLog.slice(1));
  const logPayload = existingLog.length ? newLogRows : [EXPORT_HEADERS.slice(), ...newLogRows];
  if (logPayload.length) await sheets.appendValues(config.logSheetName, 'A1', logPayload);

  return {
    status: 'ok',
    syncedAt,
    threshold,
    sourceOrders: orders.length,
    exportedOrders: rows.length,
    exportedDrivers: new Set(rows.map(row => `${row[0]}\u0000${row[2]}`)).size,
    newLogRows: newLogRows.length
  };
}

/** Never throws: the SMS cron reports this result next to its own totals. */
export async function runCodSuspicionExportSafely(dependencies = {}) {
  try {
    return await runCodSuspicionExport(dependencies);
  } catch (error) {
    console.error('[cod-export] failed', error);
    const failure = error instanceof ChatError
      ? toPublicError(error)
      : { code: 'COD_EXPORT_INTERNAL_ERROR', message: 'Export sheet COD gặp lỗi không xác định.' };
    return { status: 'failed', error: { code: failure.code, message: failure.message } };
  }
}
