import OpenAI from 'openai';
import { ChatError } from './errors.js';
import { ALLOWED_MODELS, resolveModelSelection } from './config.js';
import { MODEL_PRICING, calculateModelCost } from './pricing.js';

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const PRICE_KEYS = ['inputNanoUsdPerToken', 'cachedInputNanoUsdPerToken', 'outputNanoUsdPerToken'];

export function isChatCandidate(id) {
  // Discovery is a hint only; an explicit Responses/tool probe is required to enable.
  return /^(gpt-|chatgpt-|o\d)/.test(id) && !/(image|audio|realtime|transcri|tts|embedding|search|codex)/i.test(id);
}

export function validateDefinition(raw) {
  if (!raw || !ID_PATTERN.test(raw.id || '') || typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 120) {
    throw new ChatError('MODEL_INVALID', 'Model ID hoặc tên hiển thị không hợp lệ.', 400);
  }
  const efforts = raw.reasoningEfforts;
  if (!Array.isArray(efforts) || new Set(efforts).size !== efforts.length || efforts.some(e => !REASONING_EFFORTS.includes(e))) {
    throw new ChatError('MODEL_INVALID', 'Các mức reasoning không hợp lệ.', 400);
  }
  const defaultEffort = raw.defaultReasoningEffort || null;
  if ((efforts.length && !efforts.includes(defaultEffort)) || (!efforts.length && defaultEffort)) {
    throw new ChatError('MODEL_INVALID', 'Reasoning mặc định phải thuộc các mức đã chọn.', 400);
  }
  const pricing = {};
  for (const key of PRICE_KEYS) {
    const value = raw.pricing?.[key];
    if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 1000000)) {
      throw new ChatError('MODEL_INVALID', 'Giá token phải là số hợp lệ, tối đa 1.000 USD / triệu token.', 400);
    }
    pricing[key] = value ?? null;
  }
  return { id: raw.id, label: raw.label.trim(), reasoningEfforts: efforts, defaultReasoningEffort: defaultEffort, pricing };
}

export function legacyRegistry(models = ALLOWED_MODELS) {
  return models.map(model => ({
    id: model.id, definition: { ...model, pricing: MODEL_PRICING[model.id] },
    enabled: true, revision: 1, tested_revision: 1, source: 'legacy', available: null,
    chat_candidate: true, tested_at: null, last_seen_at: null
  }));
}

export async function loadModelRegistry(client, { allowLegacy = false, legacyModels } = {}) {
  const { data, error } = await client.from('ai_model_registry').select('*').order('id');
  if (error) {
    // Deploying code before its migration does not interrupt existing chat.
    if (allowLegacy && ['42P01', 'PGRST205'].includes(error.code)) return { models: legacyRegistry(legacyModels), migrated: false };
    throw new ChatError('MODEL_REGISTRY_UNAVAILABLE', 'Không thể đọc danh sách model. Kiểm tra migration và kết nối database.', 503);
  }
  return { models: data || [], migrated: true };
}

export async function loadRuntimeCatalog(client, baseConfig) {
  const registry = await loadModelRegistry(client, { allowLegacy: true, legacyModels: baseConfig.allowedModels });
  const enabled = registry.models.filter(row => row.enabled);
  return {
    ...baseConfig,
    allowedModels: enabled.map(row => ({ ...row.definition, id: row.id })),
    modelPricing: Object.fromEntries(enabled.map(row => [row.id, row.definition.pricing])),
    registryMigrated: registry.migrated
  };
}

function openaiClient(config) {
  return new OpenAI({ apiKey: config.openaiApiKey, timeout: 20000, maxRetries: 0 });
}

async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new ChatError('MODEL_REGISTRY_WRITE_FAILED', 'Không lưu được model. Kiểm tra model đang dùng, kết quả kiểm tra và tải lại danh sách.', 409);
  return data;
}

export async function syncModelRegistry(client, config, actor, openai = openaiClient(config)) {
  // Fully read the paginated list before touching the registry. A provider failure
  // must not clear availability or overwrite the last successful inventory.
  const discovered = [];
  try {
    for await (const model of openai.models.list()) {
      if (ID_PATTERN.test(model.id)) discovered.push({ id: model.id, chatCandidate: isChatCandidate(model.id) });
      if (discovered.length > 10000) throw new ChatError('MODEL_SYNC_TOO_LARGE', 'Danh sách model vượt giới hạn đồng bộ.', 502);
    }
  } catch {
    throw new ChatError('MODEL_SYNC_FAILED', 'Không lấy được danh sách OpenAI. Kiểm tra API key, quyền truy cập hoặc thử lại sau.', 502);
  }
  if (!discovered.length) throw new ChatError('MODEL_SYNC_EMPTY', 'OpenAI trả về danh sách rỗng; giữ nguyên dữ liệu hiện tại.', 502);
  return rpc(client, 'sync_ai_model_registry', { p_models: discovered, p_actor: actor });
}

export async function saveModelDefinition(client, raw, actor) {
  const definition = validateDefinition(raw);
  return rpc(client, 'save_ai_model_definition', {
    p_definition: definition, p_revision: raw.revision ?? null, p_actor: actor
  });
}

export async function probeModel(client, config, id, revision, actor, openai = openaiClient(config)) {
  const { models } = await loadModelRegistry(client);
  const row = models.find(model => model.id === id);
  if (!row || row.revision !== revision) throw new ChatError('MODEL_STALE', 'Model đã thay đổi. Tải lại danh sách trước khi kiểm tra.', 409);
  const definition = validateDefinition(row.definition);
  let microusd = 0;
  try {
    // Test every advertised effort, with forced tool calling and encrypted
    // reasoning when used by the production planner. No operational data sent.
    for (const effort of definition.reasoningEfforts.length ? definition.reasoningEfforts : [null]) {
      const selection = resolveModelSelection(id, effort, [definition]);
      const response = await openai.responses.create({
        model: id, input: 'Call registry_probe with ok=true.',
        tools: [{ type: 'function', name: 'registry_probe', description: 'Connectivity probe.', parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }, strict: true }],
        tool_choice: { type: 'function', name: 'registry_probe' },
        ...(selection.reasoningEffort ? { reasoning: { effort: selection.reasoningEffort }, include: ['reasoning.encrypted_content'] } : {}),
        max_output_tokens: 1024, store: false
      });
      microusd += calculateModelCost(id, response.usage, { [id]: definition.pricing }).microusd;
      if (response.status !== 'completed' || !response.output?.some(item => item.type === 'function_call' && item.name === 'registry_probe')) {
        throw new Error('Incomplete or missing function call');
      }
    }
  } catch {
    // Never relay provider messages: they may contain credential/account details.
    await rpc(client, 'record_ai_model_probe', { p_id: id, p_revision: revision, p_success: false, p_actor: actor });
    throw new ChatError('MODEL_PROBE_FAILED', 'Kiểm tra thất bại. Kiểm tra quyền truy cập, reasoning và hỗ trợ Responses/function calling. Model chưa được bật.', 422);
  }
  await rpc(client, 'record_ai_model_probe', { p_id: id, p_revision: revision, p_success: true, p_actor: actor });
  return { success: true, estimatedMicrousd: microusd, testedEfforts: definition.reasoningEfforts };
}

export async function toggleModel(client, config, body, actor) {
  if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.revision)) throw new ChatError('MODEL_INVALID', 'Trạng thái model không hợp lệ.', 400);
  if (!body.enabled && [config.model, process.env.COD_SMS_AI_MODEL || 'gpt-5.6-luna'].includes(body.id)) {
    throw new ChatError('MODEL_IN_USE', 'Không thể tắt model mặc định trong biến môi trường.', 409);
  }
  return rpc(client, 'toggle_ai_model_registry', { p_id: body.id, p_revision: body.revision, p_enabled: body.enabled, p_actor: actor });
}
