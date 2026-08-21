import React from 'react';
import { STAGE_KEYS, STAGE_CONFIG } from '../../utils/leadtimeCalc';

/**
 * Legend tự dựng bằng HTML thay vì <Legend> của recharts.
 *
 * Lý do: recharts 3 bỏ qua prop `payload` nên không ép được thứ tự, và nó tự
 * xếp theo bảng chữ cái — ra "First mile, Last mile, Middle mile, Pre-pickup",
 * tức đảo lộn thứ tự hành trình, đúng cái thông tin quan trọng nhất của một
 * breakdown theo chặng. Legend HTML còn lấy màu trực tiếp từ token nên không
 * phải đồng bộ màu ở 2 nơi.
 */
export default function StageLegend({ showE2E = false }) {
  return (
    <ul className="lt-legend">
      {STAGE_KEYS.map((key, i) => (
        <li key={key}>
          <span className="lt-legend-swatch" data-stage={key} aria-hidden="true" />
          <span className="lt-legend-order">{i + 1}</span>
          {STAGE_CONFIG[key].label}
        </li>
      ))}
      {showE2E && (
        <li>
          <span className="lt-legend-swatch lt-legend-swatch--e2e" aria-hidden="true" />
          E2E (tổng)
        </li>
      )}
    </ul>
  );
}
