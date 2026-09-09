// Single source of truth for AI model pricing.
// Money is calculated in integer nano-USD (1 USD = 1,000,000,000 nano-USD = 1,000,000 micro-USD)
// and rounded up (ceil) to integer micro-USD. Never use floating-point arithmetic for currency.

export const MODEL_PRICING = {
  'gpt-5.6-luna': {
    model: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    // $0.20 per 1M tokens = 200 nano-USD / token
    inputNanoUsdPerToken: 200,
    // $0.02 per 1M tokens = 20 nano-USD / token
    cachedInputNanoUsdPerToken: 20,
    // $1.20 per 1M tokens = 1,200 nano-USD / token
    outputNanoUsdPerToken: 1200,
    reasoningNanoUsdPerToken: 1200
  }
};

/**
 * Calculates model execution cost in micro-USD.
 * @param {string} model
 * @param {object} usage { inputTokens, cachedInputTokens, outputTokens, reasoningTokens }
 * @returns {{ configured: boolean, microusd: number, error?: string }}
 */
export function calculateModelCost(model, usage = {}) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return {
      configured: false,
      microusd: 0,
      error: `Chưa cấu hình giá cho model "${model}".`
    };
  }

  const inputTokens = Math.max(0, Number(usage.inputTokens ?? usage.input_tokens ?? 0));
  const cachedInputTokens = Math.max(0, Number(usage.cachedInputTokens ?? usage.input_tokens_details?.cached_tokens ?? 0));
  const outputTokens = Math.max(0, Number(usage.outputTokens ?? usage.output_tokens ?? 0));
  // Note: in OpenAI Responses API, output_tokens already includes reasoning_tokens.

  const nonCachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  const totalNanoUsd =
    nonCachedInputTokens * pricing.inputNanoUsdPerToken +
    cachedInputTokens * pricing.cachedInputNanoUsdPerToken +
    outputTokens * pricing.outputNanoUsdPerToken;

  const microusd = Math.ceil(totalNanoUsd / 1000);

  return {
    configured: true,
    microusd,
    breakdownNanoUsd: {
      nonCachedInput: nonCachedInputTokens * pricing.inputNanoUsdPerToken,
      cachedInput: cachedInputTokens * pricing.cachedInputNanoUsdPerToken,
      output: outputTokens * pricing.outputNanoUsdPerToken
    }
  };
}

/**
 * Formats micro-USD to USD string (e.g., $0.000077, $0.0125, $1.45)
 * @param {number} microusd
 * @returns {string}
 */
export function formatMicrousdToUsd(microusd) {
  if (microusd === null || microusd === undefined || isNaN(microusd)) {
    return 'Chưa có dữ liệu';
  }
  const value = Math.max(0, Number(microusd));
  const dollars = value / 1_000_000;
  if (dollars === 0) return '$0.00';
  if (dollars < 0.0001) return `$${dollars.toFixed(6)}`;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}
