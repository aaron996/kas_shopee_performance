import { ChatError } from './errors.js';

const KEYS = { Input: 'inputNanoUsdPerToken', 'Cached input': 'cachedInputNanoUsdPerToken', Output: 'outputNanoUsdPerToken' };
const unavailable = () => new ChatError('MODEL_PRICE_UNAVAILABLE', 'Chưa tìm được đủ giá token từ tài liệu OpenAI cho Model ID này. Bạn có thể mở bảng giá chính thức hoặc thử lại sau.', 502);

export function parseModelPricing(markdown, id) {
  if (!markdown.includes(`Model ID: \`${id}\``)) throw unavailable();
  const section = markdown.match(/^### Text tokens\s*\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/m)?.[1];
  if (!section) throw unavailable();
  const pricing = {};
  for (const [label, key] of Object.entries(KEYS)) {
    const rows = [...section.matchAll(new RegExp(`^\\| ${label} \\| \\$([0-9]+(?:\\.[0-9]+)?) \\| 1M tokens \\|\\s*$`, 'gm'))];
    if (rows.length !== 1) throw unavailable();
    const value = Number(rows[0][1]) * 1000;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw unavailable();
    pricing[key] = value;
  }
  const notes = section.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
  return { pricing, notes };
}

export async function lookupModelPricing(id, fetchPage = fetch) {
  // A single fixed official host and path: no user-supplied URL or alias guessing.
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id)) {
    throw new ChatError('MODEL_INVALID', 'Model ID không hợp lệ để tra tài liệu OpenAI.', 400);
  }
  const sourceUrl = `https://developers.openai.com/api/docs/models/${id}`;
  try {
    const response = await fetchPage(`${sourceUrl}.md`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw unavailable();
    const markdown = await response.text();
    if (markdown.length > 1000000) throw unavailable();
    return { id, ...parseModelPricing(markdown, id), sourceUrl, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw unavailable();
  }
}
