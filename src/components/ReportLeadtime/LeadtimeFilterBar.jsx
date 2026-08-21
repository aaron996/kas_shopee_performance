import React from 'react';
import { Clock, Info } from 'lucide-react';
import { THRESHOLD_PRESETS, shiftDate } from '../../utils/leadtimeCalc';
import { getClientLabel } from '../../utils/clientLabels';

const DATE_PRESETS = [
  { key: 'd1', label: 'Ngày mới nhất', days: 1 },
  { key: 'd7', label: '7 ngày', days: 7 },
  { key: 'd28', label: '28 ngày', days: 28 }
];

/**
 * Thanh filter.
 *
 * Khác bản cũ ở 3 điểm quan trọng:
 *  - Không còn toggle SPB/SPE trong tab: client lấy từ bộ lọc trên header, một
 *    nguồn sự thật duy nhất (audit B9).
 *  - Chọn ngày không có dữ liệu thì GIỮ NGUYÊN lựa chọn và báo, không tự nhảy về
 *    ngày mới nhất (audit A3).
 *  - Drill-down 2 cấp: chọn lane trước, mới hiện dropdown tuyến trong lane đó —
 *    bản cũ đổ phẳng toàn bộ cặp tỉnh vào 1 dropdown (dữ liệu thật: 1.157 mục).
 */
export default function LeadtimeFilterBar({
  allDates, earliestDate, latestDate, period, onPeriodChange,
  presetKey, onPresetChange,
  lanes, laneFilter, onLaneChange,
  pairs, pairFilter, onPairChange,
  clients, clientFilter, dataSource, syncedAt, dateHasData
}) {
  const applyDatePreset = (preset) => {
    const to = latestDate;
    const from = preset.days === 1 ? to : shiftDate(to, -(preset.days - 1));
    onPeriodChange({ preset: preset.key, from, to });
  };

  const setCustom = (field, value) => {
    const next = { ...period, preset: 'custom', [field]: value };
    if (next.from && next.to && next.from > next.to) {
      // giữ khoảng hợp lệ: kéo đầu còn lại theo thay vì im lặng trả về khoảng rỗng
      if (field === 'from') next.to = value;
      else next.from = value;
    }
    onPeriodChange(next);
  };

  const missingDate = period.from && period.from === period.to && !allDates.includes(period.from);

  return (
    <section className="lt-filterbar">
      <div className="lt-filterbar-head">
        <div className="lt-filterbar-title">
          <span className="lt-filterbar-icon" aria-hidden="true"><Clock size={18} /></span>
          <div>
            <h2>Leadtime từng chặng</h2>
            <p>
              Pre-pickup → First mile → Middle mile → Last mile ·{' '}
              {clients.length ? clients.map(getClientLabel).join(' + ') : 'không có khách hàng'}
              {clientFilter === 'ALL' && clients.length > 1 && ' (lọc Client ở header để xem riêng)'}
            </p>
          </div>
        </div>

        <div className="lt-filterbar-source">
          <span className={`lt-source-badge lt-source-badge--${dataSource}`}>
            {dataSource === 'supabase' ? 'Dữ liệu live' : dataSource === 'csv' ? 'CSV thủ công' : 'Dữ liệu mẫu'}
          </span>
          <span className="lt-source-meta">
            {allDates.length} ngày · {earliestDate} → {latestDate}
            {syncedAt ? ` · sync ${String(syncedAt).slice(0, 16).replace('T', ' ')}` : ''}
          </span>
        </div>
      </div>

      <div className="lt-filterbar-controls">
        <div className="lt-field">
          <span className="lt-field-label">Kỳ xem</span>
          <div className="lt-segmented">
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                className={period.preset === p.key ? 'is-active' : ''}
                onClick={() => applyDatePreset(p)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={period.preset === 'custom' ? 'is-active' : ''}
              onClick={() => onPeriodChange({ ...period, preset: 'custom' })}
            >
              Tuỳ chọn
            </button>
          </div>
        </div>

        {period.preset === 'custom' && (
          <div className="lt-field">
            <span className="lt-field-label">Từ / đến</span>
            <div className="lt-date-range">
              <input
                type="date"
                value={period.from || ''}
                min={earliestDate}
                max={latestDate}
                onChange={(e) => setCustom('from', e.target.value)}
              />
              <span aria-hidden="true">→</span>
              <input
                type="date"
                value={period.to || ''}
                min={earliestDate}
                max={latestDate}
                onChange={(e) => setCustom('to', e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="lt-field">
          <span className="lt-field-label">Lane</span>
          <select value={laneFilter} onChange={(e) => onLaneChange(e.target.value)} className="lt-select">
            <option value="ALL">Tất cả lane ({lanes.length})</option>
            {lanes.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>

        {laneFilter !== 'ALL' && (
          <div className="lt-field">
            <span className="lt-field-label">Tuyến trong lane</span>
            <select value={pairFilter} onChange={(e) => onPairChange(e.target.value)} className="lt-select">
              <option value="ALL">Tất cả tuyến ({pairs.length})</option>
              {pairs.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
            </select>
          </div>
        )}

        <div className="lt-field lt-field--end">
          <span className="lt-field-label">
            Ngưỡng cảnh báo
            <span
              className="lt-help"
              title="Ngưỡng lệch so baseline lịch sử của chính tuyến/lane đó. Không phải chỉ tiêu — leadtime không có target."
              aria-hidden="true"
            >
              <Info size={13} />
            </span>
          </span>
          <div className="lt-segmented">
            {Object.values(THRESHOLD_PRESETS).map(p => (
              <button
                key={p.key}
                type="button"
                className={presetKey === p.key ? 'is-active' : ''}
                onClick={() => onPresetChange(p.key)}
                title={`Cảnh báo +${p.warningPct}% · Nguy cấp +${p.criticalPct}%`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {missingDate && (
        <p className="lt-filterbar-warning">
          Ngày <strong>{period.from}</strong> chưa có dữ liệu. Dữ liệu hiện có từ {earliestDate} đến {latestDate}.
        </p>
      )}
      {!dateHasData && !missingDate && (
        <p className="lt-filterbar-warning">Khoảng ngày đang chọn không có dữ liệu.</p>
      )}
    </section>
  );
}
