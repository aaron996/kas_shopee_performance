import React, { useEffect, useMemo, useState } from 'react';
import Report1MienVungHub from '../modules/ops-metrics/Report1MienVungHub.jsx';
import Report5LaneCa1 from '../components/Report5LaneCa1.jsx';
import { groupDatesByWeek } from '../utils/dataProcessor';
import { parseSnapshotParams, unpackRows, scopeSnapshotRows, SNAPSHOT_CLIENT_LABELS } from '../utils/snapshotView';
import './snapshot.css';

// /snapshot — one dashboard table, bare, for the n8n daily Telegram report to
// screenshot. It renders the real Report1 / Report5 components on the real
// processing pipeline, so the image always matches what the dashboard shows.
// See docs/n8n-snapshot.md for the URL contract and the n8n side.
//
// The screenshot service captures once the network goes idle; the page also
// sets <html data-snapshot="ready|error"> for anything that wants to wait on it.
export default function SnapshotPage() {
  const params = useMemo(() => parseSnapshotParams(window.location.search), []);
  const [state, setState] = useState(() => (
    params.error ? { status: 'error', message: params.error } : { status: 'loading' }
  ));

  useEffect(() => {
    document.documentElement.classList.add('snapshot-html');
    return () => document.documentElement.classList.remove('snapshot-html');
  }, []);

  useEffect(() => {
    if (params.error) return undefined;
    let cancelled = false;
    const query = new URLSearchParams({ report: params.view.data, client: params.client, token: params.token });
    fetch(`/api/snapshot-data?${query}`)
      .then(async res => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
        return body;
      })
      .then(payload => {
        if (cancelled) return;
        setState({ status: 'ready', ...scopeSnapshotRows(unpackRows(payload), params.view, params.excludeHubTypes) });
      })
      .catch(error => {
        if (!cancelled) setState({ status: 'error', message: error.message || 'Không tải được dữ liệu.' });
      });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    document.documentElement.dataset.snapshot = state.status;
  }, [state.status]);

  if (state.status === 'loading') return <div className="snapshot-root" />;
  if (state.status === 'error') {
    return (
      <div className="snapshot-root">
        <div className="snapshot-error">Không tạo được ảnh báo cáo: {state.message}</div>
      </div>
    );
  }

  const { view, client, excludeHubTypes } = params;
  const isCa1 = view.data === 'ca1';
  const dates = [...new Set(state.rows.map(r => (isCa1 ? r.ngay : r.report_date)))].filter(Boolean).sort();
  const { d1Date } = groupDatesByWeek(dates);
  const scope = [
    isCa1 ? 'Nguồn Ca 1 (không tách Client)' : `${SNAPSHOT_CLIENT_LABELS[client]} (${client})`,
    d1Date && `D-1: ${d1Date.slice(8, 10)}/${d1Date.slice(5, 7)}/${d1Date.slice(0, 4)}`,
    excludeHubTypes.length > 0 && `Không gồm Hub ${excludeHubTypes.join(', ')}`
  ].filter(Boolean).join(' · ');

  return (
    <div className="snapshot-root">
      <div className="snapshot-scope">{scope}</div>
      {view.module === 'report1' ? (
        <Report1MienVungHub
          pickRows={view.data === 'pick' ? state.rows : []}
          deliRows={view.data === 'deli' ? state.rows : []}
          fdRows={view.data === 'fd' ? state.rows : []}
          clientFilter={client}
          expandAllHubs={false}
          selectedRegions={state.regions}
          isHubTypeFiltered={state.isHubTypeFiltered}
          density="comfortable"
          isFullscreen={false}
          setIsFullscreen={() => {}}
          snapshotMetric={view.metric}
        />
      ) : (
        <Report5LaneCa1 ca1Rows={state.rows} density="comfortable" onlyLane={view.lane} />
      )}
    </div>
  );
}
