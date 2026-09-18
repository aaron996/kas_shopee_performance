const CLIENTS = new Set(['SPB', 'SPE', 'ALL']);
const REGION_PATTERNS = [
  { re: /\b(hcm\s*-\s*ka)\b/i, region: 'HCM - KA' },
  { re: /\b(hcm|hồ chí minh|tp\.?\s*hcm)\b/i, region: 'HCM' },
  { re: /\b(hà nội|ha noi|hni|hno|hn)\b/i, region: 'HN' },
  { re: /\b(đnb|dnb|đông nam bộ|dong nam bo)\b/i, region: 'ĐNB' },
  { re: /\b(tnb|tây nam bộ|tay nam bo|miền tây|mien tay)\b/i, region: 'TNB' },
  { re: /\b(miền trung|mien trung|mt)\b/i, region: 'MT' },
  { re: /\b(miền bắc|mien bac|mb)\b/i, region: 'MB' }
];

export function detectExplicitClient(question) {
  if (typeof question !== 'string') return null;
  if (/\b(spb|shopee\s*bulky)\b/i.test(question)) return 'SPB';
  if (/\b(spe|shopee\s*express)\b/i.test(question)) return 'SPE';
  if (/\b(toàn bộ|toan bo|tất cả|tat ca|toàn bộ khách hàng)\b/i.test(question)) return 'ALL';
  return null;
}

export function detectExplicitRegions(question) {
  if (typeof question !== 'string') return null;
  if (/\b(toàn quốc|toan quoc|cả nước|ca nuoc)\b/i.test(question)) {
    return { regions: [], isNationwide: true };
  }
  const detected = [];
  for (const { re, region } of REGION_PATTERNS) {
    if (re.test(question)) {
      detected.push(region);
    }
  }
  return detected.length > 0 ? { regions: detected, isNationwide: false } : null;
}

export function detectExplicitHubTypes(question) {
  if (typeof question !== 'string') return null;
  const types = [];
  if (/\b(soc)\b/i.test(question)) types.push('SOC');
  if (/\b(lm|last\s*mile|giao)\b/i.test(question)) types.push('LM');
  if (/\b(fm|first\s*mile|lấy)\b/i.test(question)) types.push('FM');
  return types.length > 0 ? types : null;
}

/**
 * Resolves the effective operational scope based on precedence:
 * 1. Explicit user parameter in structured query or natural language question.
 * 2. screenContext filter if valid and not overridden.
 * 3. Fallback defaults.
 *
 * Preserves intentionally empty filters (e.g. hubTypes: []).
 */
export function resolveEffectiveScope({ question = '', query = null, screenContext = null }) {
  // --- Client Resolution ---
  let client = null;
  let clientSource = 'default';

  if (query?.client && CLIENTS.has(query.client)) {
    client = query.client;
    clientSource = 'query';
  } else {
    const explicitClient = detectExplicitClient(question);
    if (explicitClient) {
      client = explicitClient;
      clientSource = 'question';
    } else if (screenContext?.client && CLIENTS.has(screenContext.client)) {
      client = screenContext.client;
      clientSource = 'screenContext';
    }
  }

  // --- Regions Resolution ---
  let regions = null; // null means all / unspecified
  let regionsSource = 'default';
  const explicitRegions = detectExplicitRegions(question);

  if (explicitRegions) {
    regions = explicitRegions.regions;
    regionsSource = 'question';
  } else if (screenContext && Array.isArray(screenContext.regions)) {
    regions = screenContext.regions;
    regionsSource = 'screenContext';
  }

  // --- Hub Types Resolution ---
  let hubTypes = null; // null means all / unspecified
  let hubTypesSource = 'default';
  const explicitHubTypes = detectExplicitHubTypes(question);

  if (explicitHubTypes) {
    hubTypes = explicitHubTypes;
    hubTypesSource = 'question';
  } else if (screenContext && Array.isArray(screenContext.hubTypes)) {
    hubTypes = screenContext.hubTypes;
    hubTypesSource = 'screenContext';
  }

  return {
    client,
    clientSource,
    regions,
    regionsSource,
    hubTypes,
    hubTypesSource,
    activeTab: screenContext?.activeTab ?? null
  };
}
