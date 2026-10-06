import { authenticateRequest } from '../server/chat/auth.js';
import { readChatConfig } from '../server/chat/config.js';
import { resolveEffectiveChatConfig } from '../server/chat/model-config.js';
import { toPublicError } from '../server/chat/errors.js';
import { sendJson } from '../server/chat/sse.js';
import { consumeSuggestionQuota } from '../server/chat/suggestion-quota.js';
import { generateSmartSuggestions } from '../server/chat/smart-suggestions.js';
import { buildDynamicSuggestions, formatSuggestionScope, getFallbackSuggestions } from '../src/utils/chatSuggestions.js';
import { parseScreenContext } from '../server/chat/protocol.js';
import OpenAI from 'openai';

function createSuggestionModel(config) {
  if (!config?.openaiApiKey || !config.suggestionModelEnabled) return null;
  return new OpenAI({ apiKey: config.openaiApiKey, timeout: 8000, maxRetries: 0 });
}

export function createSuggestionsHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readChatConfig;
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const consumeQuota = dependencies.consumeQuota ?? consumeSuggestionQuota;
  const buildSuggestions = dependencies.buildSuggestions ?? buildDynamicSuggestions;
  const getFallback = dependencies.getFallback ?? getFallbackSuggestions;
  const buildSmartSuggestions = dependencies.buildSmartSuggestions ?? generateSmartSuggestions;
  const createModel = dependencies.createModel ?? createSuggestionModel;
  const resolveEffectiveConfig = dependencies.resolveEffectiveConfig ?? resolveEffectiveChatConfig;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: { code: 'CHAT_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' } });
      return;
    }

    try {
      const config = getConfig();
      const { user, userClient, serviceClient } = await authenticate(req.headers.authorization, config);

      let activeTab = 'report1';
      let client = 'SPB';
      let regions = null;
      let hubTypes = null;

      if (req.method === 'GET') {
        const url = new URL(req.url || '/', 'http://localhost');
        activeTab = url.searchParams.get('activeTab') || 'report1';
        client = url.searchParams.get('client') || 'SPB';
        const regionsParam = url.searchParams.get('regions');
        if (regionsParam) {
          try { regions = JSON.parse(regionsParam); } catch { regions = regionsParam.split(','); }
        }
        const hubTypesParam = url.searchParams.get('hubTypes');
        if (hubTypesParam) {
          try { hubTypes = JSON.parse(hubTypesParam); } catch { hubTypes = hubTypesParam.split(','); }
        }
      } else {
        let body = req.body;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch { body = {}; }
        }
        const ctx = body?.screenContext || body || {};
        activeTab = ctx.activeTab || 'report1';
        client = ctx.client || 'SPB';
        regions = ctx.regions ?? null;
        hubTypes = ctx.hubTypes ?? null;
      }

      const screenContext = parseScreenContext({ activeTab, client, regions, hubTypes });

      const quotaResult = await consumeQuota(serviceClient, user.id, 10);

      if (!quotaResult.allowed) {
        // Quota exhausted: silent fallback without error alert
        sendJson(res, 200, {
          quotaExceeded: true,
          remainingRefreshes: 0,
          ...getFallback(activeTab, screenContext)
        });
        return;
      }

      // Prefer questions grounded in the caller's live data; templates are the safety net.
      let result = null;
      try {
        const effectiveConfig = config.suggestionModelEnabled
          ? await resolveEffectiveConfig(serviceClient, config, user) : config;
        result = await buildSmartSuggestions({
          userClient,
          openai: createModel(effectiveConfig),
          config: effectiveConfig,
          screenContext,
          seed: quotaResult.count
        });
      } catch {
        result = null;
      }
      if (!result?.suggestions?.length) {
        result = {
          ...buildSuggestions({ activeTab, client, regions, hubTypes, seed: quotaResult.count }),
          basis: 'template',
          fallbackReason: 'no_usable_signals'
        };
      }
      if (!result.placeholder) {
        result.placeholder = getFallback(activeTab).placeholder;
      }

      result.context = screenContext;
      result.scopeLabel = formatSuggestionScope(screenContext);

      sendJson(res, 200, {
        quotaExceeded: false,
        remainingRefreshes: quotaResult.remaining,
        ...result
      });
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  };
}

export default createSuggestionsHandler();
