export const FALLBACK_SUGGESTIONS = Object.freeze({
  report1: {
    placeholder: 'Ví dụ: ODR SPB toàn quốc hôm nay?',
    suggestions: [
      'Dữ liệu mới nhất của SPB có tới ngày nào?',
      'ODR SPB toàn quốc hôm nay là bao nhiêu?',
      'Giải thích ngắn gọn chỉ số Ca 1.'
    ]
  },
  report5: {
    placeholder: 'Ví dụ: Tỷ lệ đơn về ca 1 hôm nay?',
    suggestions: [
      'Tỷ lệ đơn về ca 1 hôm nay thế nào?',
      'Giải thích ngắn gọn chỉ số Ca 1.',
      'Dữ liệu Ca 1 mới nhất có tới ngày nào?'
    ]
  },
  report3: {
    placeholder: 'Ví dụ: Leadtime SPB 7 ngày gần nhất?',
    suggestions: [
      'Leadtime trung bình của SPB 7 ngày qua là bao nhiêu?',
      'Giải thích cách tính chỉ số leadtime.',
      'Dữ liệu leadtime mới nhất có tới ngày nào?'
    ]
  },
  'report-insight': {
    placeholder: 'Ví dụ: Giải thích chỉ số ODR và target?',
    suggestions: [
      'Giải thích các chỉ số và ngưỡng cảnh báo trên dashboard.',
      'Chỉ số nào đang cần lưu ý nhất hiện nay?',
      'Giải thích chức năng phân tích insight của dashboard.'
    ]
  }
});

export function getFallbackSuggestions(activeTab = 'report1') {
  return FALLBACK_SUGGESTIONS[activeTab] || FALLBACK_SUGGESTIONS.report1;
}

export function buildDynamicSuggestions({
  activeTab = 'report1',
  client = 'SPB',
  regions = null,
  hubTypes = null,
  seed = 0
} = {}) {
  const tab = ['report1', 'report5', 'report3', 'report-insight'].includes(activeTab) ? activeTab : 'report1';
  const clientName = client === 'SPE' ? 'SPE' : client === 'ALL' ? 'toàn bộ' : 'SPB';

  let scopeText = 'toàn quốc';
  if (Array.isArray(regions)) {
    if (regions.length === 1) {
      scopeText = `vùng ${regions[0]}`;
    } else if (regions.length > 1) {
      scopeText = 'các vùng đã chọn';
    } else if (regions.length === 0) {
      scopeText = '(không chọn vùng)';
    }
  }

  let pools = { placeholders: [], candidates: [] };

  switch (tab) {
    case 'report5':
      pools = {
        placeholders: [
          'Ví dụ: Tỷ lệ đơn về ca 1 hôm nay?',
          'Ví dụ: Giải thích chỉ số Ca 1?',
          'Ví dụ: Tỷ lệ Ca 1 tuần này thế nào?'
        ],
        candidates: [
          'Tỷ lệ đơn về ca 1 hôm nay thế nào?',
          'Giải thích ngắn gọn chỉ số Ca 1.',
          'Tỷ lệ đơn về Ca 1 7 ngày gần nhất là bao nhiêu?',
          'Chỉ số Ca 1 tính như thế nào?',
          'Dữ liệu Ca 1 mới nhất có tới ngày nào?'
        ]
      };
      break;

    case 'report3':
      pools = {
        placeholders: [
          `Ví dụ: Leadtime ${clientName} 7 ngày gần nhất?`,
          `Ví dụ: Leadtime trung bình của ${clientName}?`,
          `Ví dụ: Leadtime ${clientName} hôm nay thế nào?`
        ],
        candidates: [
          `Leadtime trung bình của ${clientName} 7 ngày qua là bao nhiêu?`,
          'Giải thích cách tính chỉ số leadtime.',
          `Leadtime ${clientName} hôm nay thế nào?`,
          'Dữ liệu leadtime mới nhất có tới ngày nào?',
          `Thời gian giao hàng trung bình của ${clientName} tuần này?`
        ]
      };
      break;

    case 'report-insight':
      pools = {
        placeholders: [
          'Ví dụ: Giải thích chỉ số ODR và target?',
          'Ví dụ: Chỉ số nào cần lưu ý nhất?',
          'Ví dụ: Phân tích insight của dashboard có gì?'
        ],
        candidates: [
          'Giải thích các chỉ số và ngưỡng cảnh báo trên dashboard.',
          'Chỉ số nào đang cần lưu ý nhất hiện nay?',
          'Giải thích chức năng phân tích insight của dashboard.',
          'Công thức tính của ODR và OPR khác nhau thế nào?'
        ]
      };
      break;

    case 'report1':
    default:
      pools = {
        placeholders: [
          `Ví dụ: ODR ${clientName} ${scopeText} hôm nay?`,
          `Ví dụ: P1ST ${clientName} 7 ngày gần nhất?`,
          `Ví dụ: Dữ liệu mới nhất của ${clientName} tới ngày nào?`,
          `Ví dụ: D1ST ${clientName} hôm nay là bao nhiêu?`
        ],
        candidates: [
          `Dữ liệu mới nhất của ${clientName} có tới ngày nào?`,
          `ODR ${clientName} ${scopeText} hôm nay là bao nhiêu?`,
          `OPR ${clientName} 7 ngày gần nhất ${scopeText} là bao nhiêu?`,
          `1st Pickup (P1ST) ${clientName} ${scopeText} hôm nay thế nào?`,
          `1st Delivery (D1ST) ${clientName} ${scopeText} hôm nay thế nào?`,
          'Giải thích ngắn gọn chỉ số ODR.'
        ]
      };
      break;
  }

  const { placeholders, candidates } = pools;
  const pIndex = Math.abs(seed) % placeholders.length;
  const placeholder = placeholders[pIndex];

  const total = candidates.length;
  const offset = Math.abs(seed) % total;
  const suggestions = [];
  for (let i = 0; i < 3; i += 1) {
    suggestions.push(candidates[(offset + i) % total]);
  }

  return { placeholder, suggestions };
}
