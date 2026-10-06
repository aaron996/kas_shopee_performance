import { createClient } from '@supabase/supabase-js';
import { syncModelRegistry } from '../../server/chat/model-registry.js';
import { ChatError, toPublicError } from '../../server/chat/errors.js';
import { sendJson } from '../../server/chat/sse.js';

export const maxDuration = 60;

export function createModelSyncHandler(dependencies = {}) {
  return async (req, res) => {
    try {
      const env = dependencies.env || process.env;
      if (req.method !== 'GET') { sendJson(res, 405, { error: { message: 'Chỉ hỗ trợ GET.' } }); return; }
      if (!env.CRON_SECRET) throw new ChatError('MODEL_SYNC_CONFIG_MISSING', 'Chưa cấu hình CRON_SECRET.', 503);
      if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) throw new ChatError('MODEL_SYNC_UNAUTHORIZED', 'Không có quyền đồng bộ.', 401);
      if (!env.OPENAI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ChatError('MODEL_SYNC_CONFIG_MISSING', 'Thiếu cấu hình backend để đồng bộ model.', 503);
      const client = dependencies.client || createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      sendJson(res, 200, await syncModelRegistry(client, { openaiApiKey: env.OPENAI_API_KEY }, 'cron', dependencies.openai));
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, { error: failure });
    }
  };
}

export default createModelSyncHandler();
