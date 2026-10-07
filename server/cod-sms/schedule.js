import { createClient } from '@supabase/supabase-js';
import { readCodSmsConfig } from './config.js';
import { ChatError } from '../chat/errors.js';

export function readDispatchId(body) {
  let value;
  try { value = typeof body === 'string' ? JSON.parse(body) : body; }
  catch { throw new ChatError('COD_SMS_DISPATCH_INVALID', 'Payload scheduler không hợp lệ.', 400); }
  if (typeof value?.dispatchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.dispatchId)) {
    throw new ChatError('COD_SMS_DISPATCH_INVALID', 'Thiếu mã lượt chạy tự động hợp lệ.', 400);
  }
  return value.dispatchId;
}

export function createDispatchRepository(env = process.env) {
  // Claim even if scoring is disabled: record the failed dispatch explicitly.
  const config = readCodSmsConfig(env, { requireScoring: false });
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return {
    async claim(id) {
      const { data, error } = await client.rpc('claim_cod_sms_dispatch', { p_id: id });
      if (error) throw new ChatError('COD_SMS_DISPATCH_CLAIM_FAILED', 'Không thể nhận lượt chạy tự động.', 503);
      return data === true;
    },
    async finish(id, status, totals = null, errorCode = null) {
      const { error } = await client.rpc('finish_cod_sms_dispatch', { p_id: id, p_status: status, p_totals: totals, p_error_code: errorCode });
      if (error) throw new ChatError('COD_SMS_DISPATCH_LOG_FAILED', 'Không thể lưu trạng thái lượt chạy tự động.', 503);
    }
  };
}
