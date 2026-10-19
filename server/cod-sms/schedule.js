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
      const { data, error } = await client.rpc('claim_cod_sms_chunk', { p_id: id });
      if (error) throw new ChatError('COD_SMS_DISPATCH_CLAIM_FAILED', 'Không thể nhận lượt chạy tự động.', 503);
      return data || null;
    },
    async prepare(id, token, config) {
      const { model, rubricVersion, reasoningEffort, maxOutputTokens, modelTimeoutMs } = config;
      const { data, error } = await client.rpc('prepare_cod_sms_chunk', {
        p_id: id, p_token: token, p_config: { model, rubricVersion, reasoningEffort, maxOutputTokens, modelTimeoutMs }
      });
      if (error) throw new ChatError('COD_SMS_DISPATCH_PREPARE_FAILED', 'Không thể chuẩn bị lượt chấm SMS.', 503);
      return data;
    },
    async nextCases(id, token) {
      const { data, error } = await client.rpc('next_cod_sms_cases', { p_id: id, p_token: token });
      if (error) throw new ChatError('COD_SMS_DISPATCH_READ_FAILED', 'Không thể đọc phần batch SMS còn lại.', 503);
      return data ?? [];
    },
    async finish(id, token, errorCode = null) {
      const { data, error } = await client.rpc('finish_cod_sms_chunk', { p_id: id, p_token: token, p_error: errorCode });
      if (error) throw new ChatError('COD_SMS_DISPATCH_LOG_FAILED', 'Không thể lưu trạng thái lượt chạy tự động.', 503);
      return data;
    }
  };
}
