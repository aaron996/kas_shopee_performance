import { readChatConfig, ALLOWED_MODELS, resolveModelSelection } from '../server/chat/config.js';
import { authenticateRequest } from '../server/chat/auth.js';
import { runChatAgent } from '../server/chat/agent.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { MAX_BODY_BYTES, parseRequestBody, requestPayloadHash } from '../server/chat/protocol.js';
import { finalizeChatRequest, getUserQuotaInfo, recordQuotaRejection, reserveChatRequest } from '../server/chat/quota.js';
import { sendJson, sendSse, startSse } from '../server/chat/sse.js';
import { isDevAdminEmail } from '../src/utils/authPolicy.js';

const ALLOWED_MODEL_IDS = new Set(ALLOWED_MODELS.map(m => m.id));

async function readBody(req) {
  if (req.body !== undefined) return req.body;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new ChatError('CHAT_BODY_TOO_LARGE', 'Nội dung câu hỏi quá lớn.', 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createChatHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readChatConfig;
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const reserve = dependencies.reserve ?? reserveChatRequest;
  const runAgent = dependencies.runAgent ?? runChatAgent;
  const finalize = dependencies.finalize ?? finalizeChatRequest;
  const getQuota = dependencies.getUserQuotaInfo ?? getUserQuotaInfo;
  const recordRejection = dependencies.recordQuotaRejection ?? recordQuotaRejection;

  return async function handler(req, res) {
    if (req.method === 'GET') {
      try {
        const config = getConfig();
        const { user, serviceClient } = await authenticate(req.headers.authorization, config);
        const quotaInfo = await getQuota(serviceClient, user.id);
        const responsePayload = { quota: quotaInfo };
        if (isDevAdminEmail(user.email)) {
          responsePayload.allowedModels = config.allowedModels;
          responsePayload.defaultModel = config.model;
          responsePayload.defaultReasoningEffort = config.reasoningEffort;
        }
        sendJson(res, 200, responsePayload);
      } catch (error) {
        const failure = toPublicError(error);
        sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
      }
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: { code: 'CHAT_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' } });
      return;
    }

    let serviceClient;
    let request;
    let currentUser;
    let effectiveConfig;
    let reserved = false;
    const controller = new AbortController();
    let timeout;
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
    });

    try {
      const config = getConfig();
      effectiveConfig = config;
      timeout = setTimeout(() => controller.abort(new Error('Turn timeout')), config.turnTimeoutMs);
      request = parseRequestBody(await readBody(req), req.headers['content-length']);
      const { user, userClient, serviceClient: privilegedClient } = await authenticate(
        req.headers.authorization,
        config
      );
      serviceClient = privilegedClient;
      currentUser = user;

      // Model/reasoning override: only Dev Admin can change execution settings.
      // Ordinary users always keep the server defaults, even if they forge fields.
      if (isDevAdminEmail(user.email) && (request.model || request.reasoningEffort)) {
        const selectedModel = request.model || config.model;
        if (!ALLOWED_MODEL_IDS.has(selectedModel)) {
          throw new ChatError('CHAT_MODEL_NOT_ALLOWED', `Model "${selectedModel}" không nằm trong danh sách hỗ trợ.`, 400);
        }
        const requestedEffort = request.reasoningEffort
          || (selectedModel === config.model ? config.reasoningEffort : undefined);
        effectiveConfig = { ...config, ...resolveModelSelection(selectedModel, requestedEffort) };
      }

      const reservation = await reserve(
        serviceClient,
        effectiveConfig,
        request,
        user.id,
        requestPayloadHash(request),
        {
          email: user.email,
          clientFilter: req.headers['x-client-filter'],
          activeTab: req.headers['x-active-tab']
        }
      );
      reserved = true;

      startSse(res);
      sendSse(res, 'message_start', {
        requestId: request.requestId,
        model: effectiveConfig.model,
        reasoningEffort: effectiveConfig.reasoningEffort,
        quota: reservation
      });

      const result = await runAgent({
        config: effectiveConfig,
        request,
        userClient,
        signal: controller.signal,
        onStatus: status => sendSse(res, 'status', status),
        onText: delta => sendSse(res, 'text_delta', { delta }),
        onSource: source => sendSse(res, 'source', source)
      });

      try {
        await finalize(serviceClient, request.requestId, { status: 'completed', ...result });
      } catch (finalizeErr) {
        // Controlled logging: do not fail user response if telemetry write fails after answering
        console.error('Usage logging failure after successful chat answer:', finalizeErr);
      }

      sendSse(res, 'message_end', {
        requestId: request.requestId,
        usage: result.usage,
        estimatedMicrousd: result.actualMicrousd
      });
      res.end();
    } catch (error) {
      const failure = toPublicError(error);

      if (failure.code === 'CHAT_QUOTA_EXCEEDED' && serviceClient && request && currentUser) {
        try {
          await recordRejection(
            serviceClient,
            effectiveConfig,
            request,
            currentUser.id,
            requestPayloadHash(request),
            currentUser.email
          );
        } catch {
          // Non-blocking quota rejection logging
        }
      }

      if (reserved && serviceClient && request) {
        const isAborted = controller.signal.aborted;
        const details = error.chatDetails ?? { usage: [], toolNames: [], actualMicrousd: 0 };
        try {
          await finalize(serviceClient, request.requestId, {
            status: isAborted ? 'aborted' : 'failed',
            refundTurn: true, // Refund quota turn if failed or aborted before completion
            errorCode: failure.code,
            errorMessage: failure.message,
            ...details
          });
        } catch {
          // Preserve the original error.
        }
      }

      if (res.headersSent) {
        sendSse(res, 'error', { code: failure.code, message: failure.message });
        if (!res.writableEnded) res.end();
      } else {
        sendJson(res, failure.status, {
          error: {
            code: failure.code,
            message: failure.message
          }
        });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}

export default createChatHandler();
