import { readChatConfig } from '../server/chat/config.js';
import { authenticateRequest } from '../server/chat/auth.js';
import { isDevAdminEmail } from '../src/utils/authPolicy.js';
import { formatMicrousdToUsd } from '../server/chat/pricing.js';
import { sendJson } from '../server/chat/sse.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';

export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return 'Ẩn danh';
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${'*'.repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function escapeCsv(val) {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export function createAiOpsHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readChatConfig;
  const authenticate = dependencies.authenticate ?? authenticateRequest;

  return async function handler(req, res) {
    let config;
    let serviceClient;
    let currentUser;

    try {
      config = getConfig();
      const auth = await authenticate(req.headers.authorization, config);
      currentUser = auth.user;
      serviceClient = auth.serviceClient;

      if (!isDevAdminEmail(currentUser.email)) {
        throw new ChatError('AI_OPS_FORBIDDEN', 'Chỉ Dev Admin mới có quyền truy cập AI Operations.', 403);
      }
    } catch (err) {
      const pub = toPublicError(err);
      sendJson(res, pub.status, { error: { code: pub.code, message: pub.message } });
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const view = url.searchParams.get('view') || 'overview';

    // GET Requests
    if (req.method === 'GET') {
      try {
        if (view === 'overview') {
          const dateFrom = url.searchParams.get('from');
          const dateTo = url.searchParams.get('to');

          let query = serviceClient
            .from('ai_chat_requests')
            .select('request_id, user_id, quota_date, status, actual_microusd, total_tokens, input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, model, started_at');

          if (dateFrom) query = query.gte('quota_date', dateFrom);
          if (dateTo) query = query.lte('quota_date', dateTo);

          const { data: requests, error } = await query;
          if (error) throw error;

          const rows = requests || [];
          const activeUsers = new Set(rows.map(r => r.user_id)).size;
          const byStatus = { completed: 0, failed: 0, aborted: 0, rejected_by_quota: 0 };
          let totalTokens = 0;
          let inputTokens = 0;
          let outputTokens = 0;
          let reasoningTokens = 0;
          let cachedInputTokens = 0;
          let totalCostMicrousd = 0;
          const modelMap = new Map();
          const dayMap = new Map();

          rows.forEach(r => {
            const st = r.status || 'completed';
            if (byStatus[st] !== undefined) byStatus[st] += 1;
            totalTokens += r.total_tokens || 0;
            inputTokens += r.input_tokens || 0;
            outputTokens += r.output_tokens || 0;
            reasoningTokens += r.reasoning_tokens || 0;
            cachedInputTokens += r.cached_input_tokens || 0;
            totalCostMicrousd += Number(r.actual_microusd || 0);

            // By model
            const m = r.model || 'gpt-5.6-luna';
            const mStats = modelMap.get(m) || { model: m, requests: 0, totalTokens: 0, costMicrousd: 0 };
            mStats.requests += 1;
            mStats.totalTokens += r.total_tokens || 0;
            mStats.costMicrousd += Number(r.actual_microusd || 0);
            modelMap.set(m, mStats);

            // By day
            const d = r.quota_date;
            if (d) {
              const dStats = dayMap.get(d) || { date: d, requests: 0, activeUsers: new Set(), costMicrousd: 0, totalTokens: 0 };
              dStats.requests += 1;
              dStats.activeUsers.add(r.user_id);
              dStats.costMicrousd += Number(r.actual_microusd || 0);
              dStats.totalTokens += r.total_tokens || 0;
              dayMap.set(d, dStats);
            }
          });

          const dailyBreakdown = Array.from(dayMap.values()).map(d => ({
            date: d.date,
            requests: d.requests,
            activeUsers: d.activeUsers.size,
            costMicrousd: d.costMicrousd,
            totalTokens: d.totalTokens,
            costFormatted: formatMicrousdToUsd(d.costMicrousd)
          })).sort((a, b) => b.date.localeCompare(a.date));

          const modelBreakdown = Array.from(modelMap.values()).map(m => ({
            ...m,
            costFormatted: formatMicrousdToUsd(m.costMicrousd)
          }));

          sendJson(res, 200, {
            totalRequests: rows.length,
            activeUsersCount: activeUsers,
            byStatus,
            totalTokens: {
              total: totalTokens,
              input: inputTokens,
              output: outputTokens,
              reasoning: reasoningTokens,
              cachedInput: cachedInputTokens
            },
            totalCostMicrousd,
            totalCostFormatted: formatMicrousdToUsd(totalCostMicrousd),
            modelBreakdown,
            dailyBreakdown
          });
          return;
        }

        if (view === 'user-quotas') {
          const search = url.searchParams.get('search')?.toLowerCase().trim();

          // 1. Fetch overrides
          let overrideQuery = serviceClient
            .from('ai_chat_user_quota')
            .select('*')
            .order('updated_at', { ascending: false });

          if (search) {
            overrideQuery = overrideQuery.ilike('user_email', `%${search}%`);
          }
          const { data: overrides, error: overrideErr } = await overrideQuery;
          if (overrideErr) throw overrideErr;

          // 2. Fetch today's usage for all users
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
          const { data: dailyRows, error: dailyErr } = await serviceClient
            .from('ai_chat_quota_daily')
            .select('scope_id, turn_count, used_microusd')
            .eq('scope_type', 'user')
            .eq('usage_date', today);
          if (dailyErr) throw dailyErr;

          const dailyMap = new Map((dailyRows || []).map(r => [r.scope_id, r]));

          // 3. Fetch audit logs (last 50)
          const { data: auditLogs, error: auditErr } = await serviceClient
            .from('ai_chat_quota_audit')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
          if (auditErr) throw auditErr;

          // Merge override info with today's usage
          const overrideUsers = (overrides || []).map(o => {
            const daily = dailyMap.get(o.user_id) || { turn_count: 0, used_microusd: 0 };
            return {
              userId: o.user_id,
              userEmail: o.user_email,
              dailyTurnLimit: o.daily_turn_limit,
              isUnlimited: o.is_unlimited,
              updatedBy: o.updated_by,
              reason: o.reason,
              updatedAt: o.updated_at,
              usedToday: daily.turn_count,
              remainingTurns: o.is_unlimited ? null : Math.max(0, o.daily_turn_limit - daily.turn_count),
              costTodayMicrousd: Number(daily.used_microusd || 0)
            };
          });

          sendJson(res, 200, {
            overrides: overrideUsers,
            auditLogs: auditLogs || [],
            today,
            defaultTurnLimit: config.userDailyTurns
          });
          return;
        }

        if (view === 'research') {
          const dateFrom = url.searchParams.get('from');
          const dateTo = url.searchParams.get('to');
          const status = url.searchParams.get('status');
          const search = url.searchParams.get('search')?.trim();
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
          const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

          let query = serviceClient
            .from('ai_chat_requests')
            .select('request_id, user_id, user_email, question, question_fingerprint, status, model, total_tokens, input_tokens, output_tokens, latency_ms, actual_microusd, tool_names, started_at, quota_date', { count: 'exact' })
            .order('started_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (dateFrom) query = query.gte('quota_date', dateFrom);
          if (dateTo) query = query.lte('quota_date', dateTo);
          if (status && status !== 'all') query = query.eq('status', status);
          if (search) query = query.ilike('question', `%${search}%`);

          const { data, count, error } = await query;
          if (error) throw error;

          const rows = (data || []).map(r => ({
            requestId: r.request_id,
            userId: r.user_id,
            maskedUser: maskEmail(r.user_email),
            question: r.question || '(Trống)',
            questionFingerprint: r.question_fingerprint,
            status: r.status,
            model: r.model || 'gpt-5.6-luna',
            totalTokens: r.total_tokens || 0,
            inputTokens: r.input_tokens || 0,
            outputTokens: r.output_tokens || 0,
            latencyMs: r.latency_ms || 0,
            costMicrousd: Number(r.actual_microusd || 0),
            costFormatted: formatMicrousdToUsd(r.actual_microusd),
            toolNames: r.tool_names || [],
            startedAt: r.started_at
          }));

          // Top fingerprints aggregation for the batch
          const fpMap = new Map();
          rows.forEach(r => {
            if (r.questionFingerprint) {
              const count = fpMap.get(r.questionFingerprint) || 0;
              fpMap.set(r.questionFingerprint, count + 1);
            }
          });
          const topFingerprints = Array.from(fpMap.entries())
            .filter(([, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([fp, cnt]) => ({ fingerprint: fp, count: cnt }));

          sendJson(res, 200, {
            rows,
            totalCount: count || 0,
            topFingerprints
          });
          return;
        }

        if (view === 'export-csv') {
          const dateFrom = url.searchParams.get('from');
          const dateTo = url.searchParams.get('to');

          let query = serviceClient
            .from('ai_chat_requests')
            .select('started_at, user_email, question, status, model, latency_ms, input_tokens, output_tokens, total_tokens, actual_microusd, tool_names')
            .order('started_at', { ascending: false })
            .limit(2000);

          if (dateFrom) query = query.gte('quota_date', dateFrom);
          if (dateTo) query = query.lte('quota_date', dateTo);

          const { data, error } = await query;
          if (error) throw error;

          const headers = ['Thời gian', 'User (Masked)', 'Câu hỏi', 'Trạng thái', 'Model', 'Thời gian xử lý (ms)', 'Input Tokens', 'Output Tokens', 'Tổng Tokens', 'Chi phí ($ USD)', 'Công cụ'];
          const csvLines = [headers.map(escapeCsv).join(',')];

          (data || []).forEach(r => {
            csvLines.push([
              r.started_at ? new Date(r.started_at).toLocaleString('vi-VN') : '',
              maskEmail(r.user_email),
              r.question || '',
              r.status || '',
              r.model || '',
              r.latency_ms || 0,
              r.input_tokens || 0,
              r.output_tokens || 0,
              r.total_tokens || 0,
              formatMicrousdToUsd(r.actual_microusd),
              (r.tool_names || []).join('; ')
            ].map(escapeCsv).join(','));
          });

          const csvContent = '\uFEFF' + csvLines.join('\r\n');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="GHN_AI_Chat_Research.csv"');
          res.end(csvContent);
          return;
        }

        sendJson(res, 400, { error: { code: 'AI_OPS_INVALID_VIEW', message: 'Tham số view không hợp lệ.' } });
      } catch (err) {
        console.error('AI Ops GET error:', err);
        sendJson(res, 500, { error: { code: 'AI_OPS_ERROR', message: err.message || 'Lỗi xử lý dữ liệu AI Ops.' } });
      }
      return;
    }

    // POST Requests
    if (req.method === 'POST') {
      try {
        const bodyText = await new Promise((resolve, reject) => {
          let b = '';
          req.on('data', chunk => { b += chunk; });
          req.on('end', () => resolve(b));
          req.on('error', reject);
        });
        const body = bodyText ? JSON.parse(bodyText) : {};
        const action = body.action;

        if (action === 'set-override') {
          const { userId, userEmail, dailyTurnLimit, isUnlimited, reason } = body;
          if (!userId || !userEmail || !reason?.trim()) {
            sendJson(res, 400, { error: { code: 'AI_OPS_INVALID_BODY', message: 'Thiếu thông tin user ID, email hoặc lý do thay đổi.' } });
            return;
          }

          const { data, error } = await serviceClient.rpc('admin_set_user_quota_override', {
            p_user_id: userId,
            p_user_email: userEmail,
            p_daily_turn_limit: isUnlimited ? null : (dailyTurnLimit ?? 10),
            p_is_unlimited: Boolean(isUnlimited),
            p_reason: reason.trim()
          });

          if (error) throw error;
          sendJson(res, 200, { success: true, data });
          return;
        }

        if (action === 'reset-override') {
          const { userId, reason } = body;
          if (!userId || !reason?.trim()) {
            sendJson(res, 400, { error: { code: 'AI_OPS_INVALID_BODY', message: 'Thiếu user ID hoặc lý do đặt lại mặc định.' } });
            return;
          }

          const { data, error } = await serviceClient.rpc('admin_reset_user_quota', {
            p_user_id: userId,
            p_reason: reason.trim()
          });

          if (error) throw error;
          sendJson(res, 200, { success: true, data });
          return;
        }

        if (action === 'purge-retention') {
          const days = parseInt(body.retentionDays || '90', 10);
          const { data: purgedCount, error } = await serviceClient.rpc('purge_old_ai_chat_questions', {
            p_retention_days: days
          });

          if (error) throw error;
          sendJson(res, 200, { success: true, purgedCount });
          return;
        }

        sendJson(res, 400, { error: { code: 'AI_OPS_INVALID_ACTION', message: 'Hành động không hợp lệ.' } });
      } catch (err) {
        console.error('AI Ops POST error:', err);
        sendJson(res, 500, { error: { code: 'AI_OPS_ERROR', message: err.message || 'Lỗi thực hiện thao tác.' } });
      }
      return;
    }

    sendJson(res, 405, { error: { code: 'AI_OPS_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' } });
  };
}

export default createAiOpsHandler();
