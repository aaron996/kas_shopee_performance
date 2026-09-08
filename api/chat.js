import { readChatConfig } from '../server/chat/config.js';
import { authenticateRequest } from '../server/chat/auth.js';
import { runChatAgent } from '../server/chat/agent.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { MAX_BODY_BYTES, parseRequestBody, requestPayloadHash } from '../server/chat/protocol.js';
import { finalizeChatRequest, reserveChatRequest } from '../server/chat/quota.js';
import { sendJson, sendSse, startSse } from '../server/chat/sse.js';

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

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: { code: 'CHAT_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ POST.' } });
      return;
    }

    let serviceClient;
    let request;
    let reserved = false;
    const controller = new AbortController();
    let timeout;
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
    });

    try {
      const config = getConfig();
      timeout = setTimeout(() => controller.abort(new Error('Turn timeout')), config.turnTimeoutMs);
      request = parseRequestBody(await readBody(req), req.headers['content-length']);
      const { user, userClient, serviceClient: privilegedClient } = await authenticate(
        req.headers.authorization,
        config
      );
      serviceClient = privilegedClient;

      await reserve(serviceClient, config, request, user.id, requestPayloadHash(request));
      reserved = true;

      startSse(res);
      sendSse(res, 'message_start', { requestId: request.requestId, model: config.model });
      const result = await runAgent({
        config,
        request,
        userClient,
        signal: controller.signal,
        onStatus: status => sendSse(res, 'status', status),
        onText: delta => sendSse(res, 'text_delta', { delta }),
        onSource: source => sendSse(res, 'source', source)
      });

      await finalize(serviceClient, request.requestId, { status: 'completed', ...result });
      sendSse(res, 'message_end', {
        requestId: request.requestId,
        usage: result.usage,
        estimatedMicrousd: result.actualMicrousd
      });
      res.end();
    } catch (error) {
      const failure = toPublicError(error);
      if (reserved && serviceClient && request) {
        const details = error.chatDetails ?? { usage: [], toolNames: [], actualMicrousd: 0 };
        try {
          await finalize(serviceClient, request.requestId, { status: 'failed', ...details });
        } catch {
          // Preserve the original error. Stale reservations can be reconciled operationally.
        }
      }

      if (res.headersSent) {
        sendSse(res, 'error', { code: failure.code, message: failure.message });
        if (!res.writableEnded) res.end();
      } else {
        sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}

export default createChatHandler();
