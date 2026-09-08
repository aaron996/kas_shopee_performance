import { createClient } from '@supabase/supabase-js';
import { isAllowedEmail } from '../../src/utils/authPolicy.js';
import { ChatError } from './errors.js';

export function readBearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(typeof header === 'string' ? header.trim() : '');
  if (!match) throw new ChatError('CHAT_UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ.', 401);
  return match[1];
}

export function createSupabaseClients(config, token) {
  const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: authOptions
  });
  return { userClient, serviceClient };
}

export async function authenticateRequest(authHeader, config, dependencies = {}) {
  const token = readBearerToken(authHeader);
  const clients = dependencies.createClients?.(config, token) ?? createSupabaseClients(config, token);
  const { data, error } = await clients.userClient.auth.getUser(token);
  if (error || !data?.user) throw new ChatError('CHAT_UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn.', 401);

  const email = data.user.email ?? '';
  if (!isAllowedEmail(email)) throw new ChatError('CHAT_FORBIDDEN', 'Tài khoản này không có quyền dùng chatbot.', 403);

  return { user: data.user, ...clients };
}

