import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { ChatError } from '../chat/errors.js';
import { DEFAULT_SMS_ESCALATION_THRESHOLD } from '../../src/utils/codSuspicionProcessor.js';
import { buildCodSuspicionExportRows, EXPORT_HEADERS } from './build.js';

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

const ORDER_COLUMNS = [
  'suspicion_type', 'driver_id', 'driver_name', 'order_code', 'to_province',
  'warehouse_id', 'warehouse_name', 'cod_amount', 'end_delivery_date', 'total_score'
].join(',');

function requireEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new ChatError('COD_EXPORT_CONFIG_MISSING', `Chưa cấu hình ${key} cho export COD.`, 503);
  return value;
}

export function readCodExportConfig(env = process.env) {
  return {
    supabaseUrl: requireEnv(env, 'SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    apiToken: requireEnv(env, 'COD_EXPORT_API_TOKEN')
  };
}

/** Constant-time check of `Authorization: Bearer <COD_EXPORT_API_TOKEN>`. */
export function verifyExportToken(authHeader, expectedToken) {
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const actual = Buffer.from(String(authHeader ?? ''));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ChatError('COD_EXPORT_UNAUTHORIZED', 'Không có quyền đọc danh sách export COD.', 401);
  }
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
    },
    async loadFreshness() {
      const [snapshot, scoring] = await Promise.all([
        serviceClient.from('kas_cod_suspicion_metadata').select('synced_at')
          .order('synced_at', { ascending: false }).limit(1).maybeSingle(),
        serviceClient.from('cod_suspicion_sms_runs').select('status,started_at,finished_at')
          .order('started_at', { ascending: false }).limit(1).maybeSingle()
      ]);
      if (snapshot.error || scoring.error) {
        throw new ChatError('COD_EXPORT_FRESHNESS_READ_FAILED', 'Không thể đọc thời điểm sync/chấm SMS.', 503);
      }
      return {
        snapshotSyncedAt: snapshot.data?.synced_at ?? null,
        lastSmsRun: scoring.data
          ? { status: scoring.data.status, startedAt: scoring.data.started_at, finishedAt: scoring.data.finished_at }
          : null
      };
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

/**
 * Build the Medium/High COD suspicion order list for the nghi_ngo_COD sheet.
 * The Apps Script bound to the destination spreadsheet pulls this and writes
 * the tabs itself, so no Google credential ever lives on the server.
 */
export async function loadCodSuspicionExport(dependencies = {}) {
  const config = dependencies.config ?? readCodExportConfig(dependencies.env ?? process.env);
  const serviceClient = dependencies.serviceClient ?? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const repository = (dependencies.createRepository ?? createCodExportRepository)(serviceClient);
  const [orders, assessments, nonViolationDrivers, threshold, freshness] = await Promise.all([
    repository.loadOrders(),
    repository.loadScoredAssessments(),
    repository.loadNonViolationDrivers(),
    repository.loadThreshold(),
    repository.loadFreshness()
  ]);

  const generatedAt = formatVietnamTimestamp(dependencies.now ?? new Date());
  const rows = buildCodSuspicionExportRows({ orders, assessments, nonViolationDrivers, threshold, syncedAt: generatedAt });
  return {
    generatedAt,
    threshold,
    ...freshness,
    sourceOrders: orders.length,
    exportedDrivers: new Set(rows.map(row => `${row[0]}\u0000${row[2]}`)).size,
    headers: EXPORT_HEADERS.slice(),
    rows
  };
}
