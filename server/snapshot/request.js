import { createClient } from '@supabase/supabase-js';
import { verifySnapshotToken } from './token.js';
import { SNAPSHOT_CLIENTS, SNAPSHOT_TABLES } from './data.js';

export function readSnapshotConfig(env = process.env) {
  return {
    secret: env.SNAPSHOT_SECRET?.trim(),
    supabaseUrl: env.SUPABASE_URL?.trim(),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  };
}

export function createSnapshotServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Shared gate for /api/snapshot-data and /api/snapshot-page: config present,
// token valid, report/client known. Returns the request or a public error.
export function resolveSnapshotRequest(config, reqUrl, now = Date.now()) {
  if (!config.secret || !config.supabaseUrl || !config.serviceRoleKey) {
    return { error: { status: 503, code: 'SNAPSHOT_CONFIG_MISSING', message: 'Chưa cấu hình snapshot trên server.' } };
  }
  const url = new URL(reqUrl, 'http://localhost');
  const report = url.searchParams.get('report') || '';
  const clientName = (url.searchParams.get('client') || 'SPB').toUpperCase();

  if (!verifySnapshotToken(config.secret, url.searchParams.get('token'), now)) {
    return { error: { status: 401, code: 'SNAPSHOT_TOKEN_INVALID', message: 'Token snapshot không hợp lệ hoặc đã hết hạn.' } };
  }
  if (!Object.hasOwn(SNAPSHOT_TABLES, report) || !SNAPSHOT_CLIENTS.includes(clientName)) {
    return { error: { status: 400, code: 'SNAPSHOT_INVALID_REQUEST', message: 'report hoặc client không hợp lệ.' } };
  }
  return { report, clientName };
}
