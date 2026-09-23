import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Clock, User, Cpu } from 'lucide-react';
import { fetchCodSmsRunItems, fetchCodSmsRuns } from '../utils/codSuspicionClient';
import { formatDateTimeVN } from '../utils/codSuspicionProcessor';

const RUNS_PAGE_SIZE = 20;

const RUN_LABELS = {
  'cron:sweep': 'Cron hằng ngày',
  'manual:sweep': 'Thủ công · Quét toàn bộ',
  'manual:cases': 'Thủ công · Đơn chọn',
  'manual:retry_failed': 'Thủ công · Chấm lại đơn lỗi'
};

const RUN_STATUS = {
  running: { text: 'Đang chạy', level: 'pending' },
  completed: { text: 'Hoàn tất', level: 'no_evidence' },
  aborted: { text: 'Đã dừng', level: 'medium' },
  failed: { text: 'Lỗi', level: 'failed' }
};

const OUTCOMES = {
  scored: { text: 'Đã chấm', level: 'high' },
  no_evidence: { text: 'Không bằng chứng', level: 'no_evidence' },
  failed: { text: 'Lỗi', level: 'failed' },
  skipped_unchanged: { text: 'Bỏ qua (không đổi)', level: 'unscored' }
};

const ITEM_FILTERS = [
  { id: 'processed', label: 'Đã xử lý' },
  { id: 'failed', label: 'Lỗi' },
  { id: 'scored', label: 'Đã chấm' },
  { id: 'no_evidence', label: 'Không bằng chứng' },
  { id: 'skipped_unchanged', label: 'Bỏ qua' },
  { id: 'all', label: 'Tất cả' }
];

function formatDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const seconds = Math.max(0, Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
}

function matchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'processed') return item.outcome !== 'skipped_unchanged';
  return item.outcome === filter;
}

function RunCounts({ summary }) {
  const parts = [
    { key: 'scored', value: summary.scored, label: 'đã chấm', level: 'high' },
    { key: 'noEvidence', value: summary.noEvidence, label: 'không BC', level: 'no_evidence' },
    { key: 'failed', value: summary.failed, label: 'lỗi', level: 'failed' },
    { key: 'skipped', value: summary.skippedUnchanged, label: 'bỏ qua', level: 'unscored' }
  ];
  return (
    <span className="cod-sms-runs__counts">
      {parts.map(part => (
        <span
          key={part.key}
          className={`cod-sms-runs__count cod-sms-runs__count--${part.level}${part.value ? '' : ' is-zero'}`}
        >
          <strong>{part.value ?? 0}</strong> {part.label}
        </span>
      ))}
    </span>
  );
}

function RunItems({ run, state, driverNameById, onRetry }) {
  const processedCount = state?.items?.filter(item => item.outcome !== 'skipped_unchanged').length ?? 0;
  const [filter, setFilter] = useState(() => (run.summary.failed > 0 ? 'failed' : 'processed'));
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const result = {};
    for (const option of ITEM_FILTERS) {
      result[option.id] = (state?.items ?? []).filter(item => matchesFilter(item, option.id)).length;
    }
    return result;
  }, [state?.items]);

  const visibleItems = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return (state?.items ?? []).filter(item => matchesFilter(item, filter) && (
      !cleanQuery
      || item.key.orderCode.toLowerCase().includes(cleanQuery)
      || item.key.driverId.toLowerCase().includes(cleanQuery)
    ));
  }, [state?.items, filter, query]);

  if (!state || state.loading) {
    return <div className="cod-sms-runs__detail-empty">Đang tải chi tiết batch...</div>;
  }
  if (state.error) {
    return (
      <div className="cod-sms-runs__detail-empty cod-sms-runs__detail-empty--error">
        {state.error}{' '}
        <button type="button" className="cod-sms-runs__link" onClick={onRetry}>Thử lại</button>
      </div>
    );
  }

  return (
    <div className="cod-sms-runs__detail">
      {run.error && (
        <div className="cod-sms-runs__run-error">
          Batch dừng vì lỗi: {run.error.message} <code>{run.error.code}</code>
        </div>
      )}
      <div className="cod-sms-runs__detail-toolbar">
        <div className="cod-sms-runs__filters" role="group" aria-label="Lọc kết quả theo đơn">
          {ITEM_FILTERS.map(option => (
            <button
              key={option.id}
              type="button"
              className={`cod-sms-runs__filter${filter === option.id ? ' is-active' : ''}`}
              onClick={() => setFilter(option.id)}
              disabled={counts[option.id] === 0 && option.id !== 'all' && option.id !== filter}
            >
              {option.label} <span>{counts[option.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Tìm mã đơn / ID tài xế"
          className="cod-sms-runs__search"
        />
      </div>

      {state.items.length === 0 ? (
        <div className="cod-sms-runs__detail-empty">Batch này không xử lý đơn nào.</div>
      ) : visibleItems.length === 0 ? (
        <div className="cod-sms-runs__detail-empty">
          Không có đơn phù hợp bộ lọc.
          {processedCount === 0 && ' Tất cả đơn đều không đổi so với lần chấm trước.'}
        </div>
      ) : (
        <div className="cod-sms-runs__table-wrap">
          <table className="cod-sms-runs__table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Tài xế</th>
                <th>Loại</th>
                <th>Kết quả</th>
                <th className="is-num">Điểm</th>
                <th>Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
                const outcome = OUTCOMES[item.outcome] ?? { text: item.outcome, level: 'unscored' };
                const driverName = driverNameById?.get(item.key.driverId);
                return (
                  <tr key={`${item.key.suspicionType}-${item.key.driverId}-${item.key.orderCode}`}>
                    <td className="is-mono">{item.key.orderCode}</td>
                    <td>
                      <span className="is-mono">{item.key.driverId}</span>
                      {driverName && <span className="cod-sms-runs__muted"> · {driverName}</span>}
                    </td>
                    <td>{item.key.suspicionType}</td>
                    <td>
                      <span className={`cod-sms-badge cod-sms-badge--${outcome.level}`}>{outcome.text}</span>
                    </td>
                    <td className="is-num">{item.smsScore ?? '—'}</td>
                    <td className={item.technicalError ? 'cod-sms-runs__error-cell' : 'cod-sms-runs__muted'}>
                      {item.technicalError ? (
                        <>
                          {item.technicalError.message}
                          <code>{item.technicalError.code}</code>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Dev Admin log of SMS AI scoring, one row per batch run (daily cron or a
 * manual trigger). Expanding a run lazily loads what it did to each order.
 */
export default function CodSmsRunHistoryPanel({ driverNameById, refreshKey = 0 }) {
  const [runs, setRuns] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByRun, setItemsByRun] = useState(() => new Map());

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await fetchCodSmsRuns({ limit: RUNS_PAGE_SIZE, offset });
    if (result.success) {
      setRuns(result.runs);
      setTotalCount(result.meta?.totalCount ?? result.runs.length);
    } else {
      setError(result.error || 'Không thể tải lịch sử batch chấm SMS.');
    }
    setLoading(false);
  }, [offset]);

  const loadItems = useCallback(async runId => {
    setItemsByRun(prev => new Map(prev).set(runId, { loading: true, items: [], error: '' }));
    const result = await fetchCodSmsRunItems(runId);
    setItemsByRun(prev => new Map(prev).set(runId, result.success
      ? { loading: false, items: result.items, error: '' }
      : { loading: false, items: [], error: result.error || 'Không thể tải chi tiết batch.' }));
  }, []);

  const reload = useCallback(() => {
    // A running batch's items keep changing, so drop every cached detail.
    setItemsByRun(new Map());
    loadRuns();
    if (expandedId) loadItems(expandedId);
  }, [loadRuns, loadItems, expandedId]);

  useEffect(() => {
    loadRuns();
    // refreshKey bumps after a manual run finishes so the new batch shows up.
  }, [loadRuns, refreshKey]);

  const toggleRun = useCallback(runId => {
    const next = expandedId === runId ? null : runId;
    setExpandedId(next);
    if (next && !itemsByRun.has(next)) loadItems(next);
  }, [expandedId, itemsByRun, loadItems]);

  return (
    <section className="cod-sms-runs" aria-labelledby="cod-sms-runs-title">
      <header className="cod-sms-runs__header">
        <div>
          <h3 id="cod-sms-runs-title">Lịch sử batch chấm điểm SMS AI</h3>
          <p>Mỗi dòng là một lượt chạy (cron hoặc thủ công). Bấm vào để xem kết quả từng đơn.</p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="cod-workflow-action cod-workflow-action--secondary cod-sms-runs__reload"
        >
          <RefreshCw size={13} className={loading ? 'is-spinning' : ''} /> Tải lại
        </button>
      </header>

      {error && <div className="cod-sms-runs__banner" role="alert">{error}</div>}

      <div className="cod-sms-runs__list">
        {loading && runs.length === 0 ? (
          <div className="cod-sms-runs__detail-empty">Đang tải...</div>
        ) : runs.length === 0 ? (
          <div className="cod-sms-runs__detail-empty">
            Chưa có batch nào được ghi log. Batch đầu tiên sẽ xuất hiện sau lượt cron hoặc lượt chạy thủ công kế tiếp.
          </div>
        ) : runs.map(run => {
          const isOpen = expandedId === run.id;
          const status = RUN_STATUS[run.status] ?? { text: run.status, level: 'unscored' };
          const duration = formatDuration(run.startedAt, run.finishedAt);
          return (
            <div key={run.id} className={`cod-sms-runs__run${isOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="cod-sms-runs__run-head"
                aria-expanded={isOpen}
                onClick={() => toggleRun(run.id)}
              >
                <ChevronRight size={16} className="cod-sms-runs__chevron" aria-hidden="true" />
                <span className="cod-sms-runs__when">
                  <strong>{formatDateTimeVN(run.startedAt)}</strong>
                  <span className="cod-sms-runs__trigger">
                    {RUN_LABELS[`${run.trigger}:${run.mode}`] ?? `${run.trigger} · ${run.mode}`}
                  </span>
                </span>
                <span className={`cod-sms-badge cod-sms-badge--${status.level}`}>{status.text}</span>
                <RunCounts summary={run.summary} />
                <span className="cod-sms-runs__meta">
                  <span title="Model"><Cpu size={12} aria-hidden="true" /> {run.model}</span>
                  {duration && <span title="Thời gian chạy"><Clock size={12} aria-hidden="true" /> {duration}</span>}
                  {run.triggeredByEmail && (
                    <span title="Người chạy"><User size={12} aria-hidden="true" /> {run.triggeredByEmail.split('@')[0]}</span>
                  )}
                </span>
              </button>
              {isOpen && (
                <RunItems
                  run={run}
                  state={itemsByRun.get(run.id)}
                  driverNameById={driverNameById}
                  onRetry={() => loadItems(run.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {totalCount > RUNS_PAGE_SIZE && (
        <footer className="cod-sms-runs__footer">
          <span>{`${offset + 1}–${Math.min(offset + RUNS_PAGE_SIZE, totalCount)} / ${totalCount} batch`}</span>
          <div>
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => { setExpandedId(null); setOffset(Math.max(0, offset - RUNS_PAGE_SIZE)); }}
              className="cod-workflow-action cod-workflow-action--secondary cod-sms-runs__reload"
            >
              Mới hơn
            </button>
            <button
              type="button"
              disabled={loading || offset + RUNS_PAGE_SIZE >= totalCount}
              onClick={() => { setExpandedId(null); setOffset(offset + RUNS_PAGE_SIZE); }}
              className="cod-workflow-action cod-workflow-action--secondary cod-sms-runs__reload"
            >
              Cũ hơn
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
