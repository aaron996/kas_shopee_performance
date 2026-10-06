import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Pencil, CheckCircle2 } from 'lucide-react';
import './AiModelRegistry.css';

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const PRICES = [
  ['inputNanoUsdPerToken', 'Input'], ['cachedInputNanoUsdPerToken', 'Cached input'], ['outputNanoUsdPerToken', 'Output']
];
const blank = () => ({ id: '', label: '', revision: null, reasoningEfforts: [], defaultReasoningEffort: null, pricing: {} });
const date = value => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa đồng bộ';

export default function AiModelRegistry({ fetchWithAuth, onChanged }) {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setRegistry(await fetchWithAuth('/api/ai-ops?view=model-registry')); }
    catch (err) { setRegistry(null); setError(err.message || 'Không tải được danh sách model.'); }
    finally { setLoading(false); }
  }, [fetchWithAuth]);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, payload, success) {
    setBusy(action);
    setError(''); setNotice('');
    try {
      const result = await fetchWithAuth('/api/ai-ops', { method: 'POST', body: JSON.stringify({ action, ...payload }) });
      if (action === 'save-model') setForm(null);
      await load();
      onChanged?.();
      setNotice(typeof success === 'function' ? success(result) : success);
    } catch (err) {
      // A failed probe is persisted, so refresh its visible state too.
      if (action === 'probe-model') await load();
      setError(err.message || 'Không thực hiện được thao tác. Tải lại rồi thử lại.');
    } finally { setBusy(''); }
  }

  function save(event) {
    event.preventDefault();
    const pricing = {};
    for (const [key] of PRICES) {
      const raw = form.pricing[key];
      const value = raw === '' || raw === undefined || raw === null ? null : Number(raw);
      const nano = value === null ? null : Math.round(value * 1000);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1000 || Math.abs(value * 1000 - nano) > 0.00001)) {
        setError('Giá phải từ 0 đến 1.000 USD / triệu token, tối đa 3 chữ số thập phân.'); return;
      }
      pricing[key] = nano;
    }
    mutate('save-model', { definition: { ...form, pricing } }, 'Đã lưu. Kiểm tra kết nối trước khi bật model.');
  }

  const models = registry?.models || [];
  const filtered = models.filter(row => (showAll || row.chat_candidate || row.enabled) &&
    `${row.id} ${row.definition.label}`.toLowerCase().includes(search.toLowerCase()));
  const syncedAt = models.reduce((latest, row) => row.last_seen_at && (!latest || row.last_seen_at > latest) ? row.last_seen_at : latest, null);
  const disabled = Boolean(busy) || loading || !registry?.migrated;

  return <section className="model-registry" aria-labelledby="model-registry-title">
    <header className="model-registry-header">
      <div><h3 id="model-registry-title">Quản lý model</h3>
        <p>Model mới được phát hiện mỗi ngày. Kiểm tra và bật để đưa vào menu cấu hình chatbot.</p>
        <span className="model-registry-meta">Đồng bộ gần nhất: {date(syncedAt)} · {models.filter(row => row.enabled).length} model đã bật</span>
      </div>
      <div className="model-registry-actions">
        <button className="btn-secondary" disabled={loading || Boolean(busy)} onClick={load}><RefreshCw size={16} /> Tải lại</button>
        <button className="btn-primary" disabled={disabled} onClick={() => mutate('sync-models', {}, result => `Đã đồng bộ ${result.total} model, phát hiện ${result.added} model mới.`)}><RefreshCw size={16} /> {busy === 'sync-models' ? 'Đang đồng bộ…' : 'Đồng bộ từ OpenAI'}</button>
        <button className="btn-secondary" disabled={disabled} onClick={() => { setForm(blank()); setEditing(false); setError(''); }}><Plus size={16} /> Thêm thủ công</button>
      </div>
    </header>
    {error && <div className="model-registry-error" role="alert">{error}</div>}
    {notice && <div className="model-registry-notice" role="status">{notice}</div>}
    {registry && !registry.migrated && <p role="status">Chưa áp dụng migration quản lý model. Danh sách hiện tại vẫn hoạt động; các thao tác quản lý sẽ mở sau khi migration hoàn tất.</p>}

    {form && <form className="model-registry-form" onSubmit={save}>
      <h4>{editing ? `Cấu hình ${form.id}` : 'Thêm model'}</h4>
      <div className="model-registry-fields">
        <label>Model ID<input required maxLength={200} value={form.id} disabled={editing || Boolean(busy)} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="Model ID từ OpenAI API" /></label>
        <label>Tên hiển thị<input required maxLength={120} value={form.label} disabled={Boolean(busy)} onChange={e => setForm({ ...form, label: e.target.value })} /></label>
      </div>
      <fieldset disabled={Boolean(busy)}><legend>Reasoning được hỗ trợ</legend>
        <p>Chọn theo tài liệu model. Để trống nếu model không hỗ trợ reasoning.</p>
        <div className="model-registry-efforts">{EFFORTS.map(effort => <label key={effort}><input type="checkbox" checked={form.reasoningEfforts.includes(effort)} onChange={e => {
          const next = e.target.checked ? [...form.reasoningEfforts, effort] : form.reasoningEfforts.filter(item => item !== effort);
          setForm({ ...form, reasoningEfforts: next, defaultReasoningEffort: next.includes(form.defaultReasoningEffort) ? form.defaultReasoningEffort : next[0] || null });
        }} />{effort}</label>)}</div>
        {form.reasoningEfforts.length > 0 && <label>Reasoning mặc định<select value={form.defaultReasoningEffort || ''} onChange={e => setForm({ ...form, defaultReasoningEffort: e.target.value })}>{form.reasoningEfforts.map(effort => <option key={effort}>{effort}</option>)}</select></label>}
      </fieldset>
      <fieldset disabled={Boolean(busy)}><legend>Giá token — USD / 1 triệu token</legend>
        <p>Lấy giá từ bảng giá OpenAI. Giá chưa biết có thể để trống, nhưng phải điền đủ trước khi bật.</p>
        <div className="model-registry-fields">{PRICES.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="1000" step="0.001" value={form.pricing[key] ?? ''} onChange={e => setForm({ ...form, pricing: { ...form.pricing, [key]: e.target.value } })} /></label>)}</div>
      </fieldset>
      <div className="model-registry-actions"><button type="submit" className="btn-primary" disabled={Boolean(busy)}>{busy === 'save-model' ? 'Đang lưu…' : 'Lưu cấu hình'}</button><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => setForm(null)}>Hủy</button></div>
    </form>}

    <div className="model-registry-filter"><label>Tìm model<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc Model ID" /></label>
      <label className="model-registry-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Hiện cả model khác (ảnh, âm thanh…)</label>
    </div>
    {loading ? <p role="status">Đang tải danh sách model…</p> : registry && <>
      <div className="model-registry-table-wrap"><table><caption className="model-registry-sr">Danh sách model và trạng thái sử dụng</caption><thead><tr><th>Model</th><th>Trạng thái</th><th>Giá / triệu token</th><th>Thao tác</th></tr></thead>
        <tbody>{filtered.map(row => {
          const ready = row.tested_revision === row.revision;
          const priced = PRICES.every(([key]) => Number.isInteger(row.definition.pricing?.[key]));
          return <tr key={row.id}><td><strong>{row.definition.label}</strong><code>{row.id}</code><small>Reasoning: {row.definition.reasoningEfforts.join(', ') || 'Không sử dụng'}</small></td>
            <td><span className={row.enabled ? 'model-registry-enabled' : ''}>{row.enabled ? 'Đã bật' : ready ? 'Kiểm tra đạt — chưa bật' : row.probe_success === false ? 'Kiểm tra thất bại' : 'Mới — chưa kiểm tra'}</span>
              {row.source === 'legacy' && !row.tested_at && <small>Cấu hình có sẵn</small>}
              {row.available === false && <small>Không có trong lần đồng bộ gần nhất</small>}
              {row.tested_at && <small>Kiểm tra: {date(row.tested_at)}</small>}
            </td><td>{PRICES.map(([key, label]) => <small key={key}>{label}: {row.definition.pricing?.[key] == null ? 'Chưa khai báo' : `$${row.definition.pricing[key] / 1000}`}</small>)}</td>
            <td><div className="model-registry-actions">
              <button className="btn-secondary" disabled={disabled || row.enabled} title={row.enabled ? 'Tắt model trước khi sửa. Model đang được dùng cần đổi cấu hình trước.' : ''} onClick={() => {
                setEditing(true); setError(''); setForm({ ...row.definition, id: row.id, revision: row.revision, pricing: Object.fromEntries(PRICES.map(([key]) => [key, row.definition.pricing?.[key] == null ? '' : row.definition.pricing[key] / 1000])) });
              }} aria-label={`Sửa ${row.id}`}><Pencil size={14} /> Sửa</button>
              <button className="btn-secondary" disabled={disabled || Boolean(form) || row.enabled} onClick={() => mutate('probe-model', { id: row.id, revision: row.revision }, 'Kiểm tra đạt. Bạn có thể bật model sau khi khai báo đủ giá token.')} aria-label={`Kiểm tra ${row.id}`}><CheckCircle2 size={14} /> Kiểm tra</button>
              <button className="btn-secondary" disabled={disabled || Boolean(form) || (!row.enabled && (!ready || !priced))} onClick={() => mutate('toggle-model', { id: row.id, revision: row.revision, enabled: !row.enabled }, row.enabled ? 'Đã tắt model.' : 'Đã bật model. Vào Cấu Hình Chatbot để chọn và Áp dụng.')} aria-label={`${row.enabled ? 'Tắt' : 'Bật'} ${row.id}`}>{row.enabled ? 'Tắt' : 'Bật'}</button>
            </div></td></tr>;
        })}</tbody></table></div>
      {!filtered.length && <p>Không có model phù hợp. Thử tìm tên khác hoặc đồng bộ từ OpenAI.</p>}
    </>}
    <p className="model-registry-footnote">Đồng bộ không tự đổi model đang chạy. Kiểm tra kết nối gửi yêu cầu thử cho từng mức reasoning đã chọn và có thể phát sinh phí token. Model đang dùng không thể tắt; hãy đổi cấu hình All Users và cấu hình riêng trước.</p>
  </section>;
}
