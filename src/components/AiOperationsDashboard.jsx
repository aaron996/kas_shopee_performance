import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Layers,
  Percent,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

function maskEmailClient(email) {
  if (typeof email !== 'string' || !email.includes('@')) return 'Ẩn danh';
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

const REASONING_LABELS = {
  none: 'Tắt',
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
  xhigh: 'Rất cao',
  max: 'Tối đa'
};

export default function AiOperationsDashboard() {
  const [activeSubtab, setActiveSubtab] = useState('overview'); // 'overview' | 'quotas' | 'research'
  const [devChatConfig, setDevChatConfig] = useState(null);
  const [selectedDevModel, setSelectedDevModel] = useState('');
  const [selectedDevReasoning, setSelectedDevReasoning] = useState('');

  // Common Date Filter
  const [dateRange, setDateRange] = useState('7d'); // 'today' | '7d' | 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Overview State
  const [overviewData, setOverviewData] = useState(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  // User Quotas State
  const [quotaSearch, setQuotaSearch] = useState('');
  const [quotasData, setQuotasData] = useState({ overrides: [], auditLogs: [], today: '', defaultTurnLimit: 10 });
  const [isQuotasLoading, setIsQuotasLoading] = useState(false);
  const [quotasError, setQuotasError] = useState('');

  // Modal Set/Reset Quota State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetUser, setModalTargetUser] = useState(null);
  const [modalQuotaType, setModalQuotaType] = useState('custom'); // 'custom' | 'unlimited' | 'default'
  const [modalCustomLimit, setModalCustomLimit] = useState(20);
  const [modalReason, setModalReason] = useState('');
  const [isSubmittingQuota, setIsSubmittingQuota] = useState(false);
  const [modalError, setModalError] = useState('');

  // Research State
  const [researchLogs, setResearchLogs] = useState([]);
  const [researchTotal, setResearchTotal] = useState(0);
  const [researchTopFingerprints, setResearchTopFingerprints] = useState([]);
  const [researchStatusFilter, setResearchStatusFilter] = useState('all');
  const [researchSearch, setResearchSearch] = useState('');
  const [isResearchLoading, setIsResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [isPurging, setIsPurging] = useState(false);

  // Compute actual date strings
  const getComputedDates = useCallback(() => {
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);

    if (dateRange === 'today') {
      return { from: todayStr, to: todayStr };
    }
    if (dateRange === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      const fromStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
      return { from: fromStr, to: todayStr };
    }
    if (dateRange === 'month') {
      const fromStr = `${todayStr.slice(0, 7)}-01`;
      return { from: fromStr, to: todayStr };
    }
    return { from: customFrom || todayStr, to: customTo || todayStr };
  }, [dateRange, customFrom, customTo]);

  // Auth fetch helper
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Chưa đăng nhập hoặc phiên đã hết hạn.');

    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (!res.ok) {
      let errPayload;
      try { errPayload = await res.json(); } catch { /* ignore */ }
      throw new Error(errPayload?.error?.message || `Lỗi yêu cầu (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDevChatConfig() {
      try {
        const config = await fetchWithAuth('/api/chat');
        if (!active || !config?.allowedModels?.length) return;

        const storedModel = window.localStorage.getItem('kas-chat-model');
        const modelId = config.allowedModels.some(model => model.id === storedModel)
          ? storedModel
          : config.defaultModel;
        const model = config.allowedModels.find(candidate => candidate.id === modelId);
        const storedReasoning = window.localStorage.getItem(`kas-chat-reasoning-effort:${modelId}`);
        const defaultReasoning = modelId === config.defaultModel
          ? config.defaultReasoningEffort
          : model?.defaultReasoningEffort;

        setDevChatConfig(config);
        setSelectedDevModel(modelId || '');
        setSelectedDevReasoning(model?.reasoningEfforts?.includes(storedReasoning)
          ? storedReasoning
          : (defaultReasoning || ''));
      } catch {
        // The API deliberately returns no configuration to non-Dev Admins.
      }
    }

    loadDevChatConfig();
    return () => { active = false; };
  }, [fetchWithAuth]);

  const notifyChatConfigChange = () => window.dispatchEvent(new Event('kas-chat-config-change'));

  const handleDevModelChange = event => {
    const modelId = event.target.value;
    const model = devChatConfig?.allowedModels?.find(candidate => candidate.id === modelId);
    const storedReasoning = window.localStorage.getItem(`kas-chat-reasoning-effort:${modelId}`);
    const reasoning = model?.reasoningEfforts?.includes(storedReasoning)
      ? storedReasoning
      : (model?.defaultReasoningEffort || '');

    setSelectedDevModel(modelId);
    setSelectedDevReasoning(reasoning);
    window.localStorage.setItem('kas-chat-model', modelId);
    if (reasoning) window.localStorage.setItem(`kas-chat-reasoning-effort:${modelId}`, reasoning);
    notifyChatConfigChange();
  };

  const handleDevReasoningChange = event => {
    const reasoning = event.target.value;
    setSelectedDevReasoning(reasoning);
    window.localStorage.setItem(`kas-chat-reasoning-effort:${selectedDevModel}`, reasoning);
    notifyChatConfigChange();
  };

  const resetDevChatConfig = () => {
    const modelId = devChatConfig?.defaultModel;
    const model = devChatConfig?.allowedModels?.find(candidate => candidate.id === modelId);
    const reasoning = devChatConfig?.defaultReasoningEffort || model?.defaultReasoningEffort || '';
    setSelectedDevModel(modelId || '');
    setSelectedDevReasoning(reasoning);
    window.localStorage.removeItem('kas-chat-model');
    if (modelId) window.localStorage.removeItem(`kas-chat-reasoning-effort:${modelId}`);
    notifyChatConfigChange();
  };

  // 1. Fetch Overview
  const fetchOverview = useCallback(async () => {
    setIsOverviewLoading(true);
    setOverviewError('');
    try {
      const { from, to } = getComputedDates();
      const data = await fetchWithAuth(`/api/ai-ops?view=overview&from=${from}&to=${to}`);
      setOverviewData(data);
    } catch (err) {
      setOverviewError(err.message || 'Không thể tải dữ liệu tổng quan.');
    } finally {
      setIsOverviewLoading(false);
    }
  }, [fetchWithAuth, getComputedDates]);

  // 2. Fetch User Quotas
  const fetchUserQuotas = useCallback(async () => {
    setIsQuotasLoading(true);
    setQuotasError('');
    try {
      const url = `/api/ai-ops?view=user-quotas${quotaSearch ? `&search=${encodeURIComponent(quotaSearch)}` : ''}`;
      const data = await fetchWithAuth(url);
      setQuotasData(data);
    } catch (err) {
      setQuotasError(err.message || 'Không thể tải danh sách quota.');
    } finally {
      setIsQuotasLoading(false);
    }
  }, [fetchWithAuth, quotaSearch]);

  // 3. Fetch Research
  const fetchResearch = useCallback(async () => {
    setIsResearchLoading(true);
    setResearchError('');
    try {
      const { from, to } = getComputedDates();
      let url = `/api/ai-ops?view=research&from=${from}&to=${to}&status=${researchStatusFilter}&limit=100`;
      if (researchSearch.trim()) url += `&search=${encodeURIComponent(researchSearch.trim())}`;

      const data = await fetchWithAuth(url);
      setResearchLogs(data.rows || []);
      setResearchTotal(data.totalCount || 0);
      setResearchTopFingerprints(data.topFingerprints || []);
    } catch (err) {
      setResearchError(err.message || 'Không thể tải dữ liệu nghiên cứu.');
    } finally {
      setIsResearchLoading(false);
    }
  }, [fetchWithAuth, getComputedDates, researchStatusFilter, researchSearch]);

  // Load active tab data
  useEffect(() => {
    if (activeSubtab === 'overview') fetchOverview();
    if (activeSubtab === 'quotas') fetchUserQuotas();
    if (activeSubtab === 'research') fetchResearch();
  }, [activeSubtab, fetchOverview, fetchUserQuotas, fetchResearch]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { from, to } = getComputedDates();
      const res = await fetch(`/api/ai-ops?view=export-csv&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Không thể xuất file CSV.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GHN_AI_Chat_Research_${from}_to_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Lỗi xuất CSV: ${err.message}`);
    }
  };

  // Handle Submit Quota Override
  const handleSubmitQuota = async (e) => {
    e.preventDefault();
    if (!modalTargetUser?.email?.trim() || !modalReason.trim()) {
      setModalError('Vui lòng nhập đầy đủ email và lý do.');
      return;
    }

    setIsSubmittingQuota(true);
    setModalError('');

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUserId = (modalTargetUser.userId && UUID_REGEX.test(modalTargetUser.userId)) ? modalTargetUser.userId : null;
    const userEmail = modalTargetUser.email.trim().toLowerCase();

    try {
      if (modalQuotaType === 'default') {
        await fetchWithAuth('/api/ai-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reset-override',
            userId: validUserId,
            userEmail,
            reason: modalReason.trim()
          })
        });
      } else {
        await fetchWithAuth('/api/ai-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set-override',
            userId: validUserId,
            userEmail,
            dailyTurnLimit: modalQuotaType === 'unlimited' ? null : Number(modalCustomLimit),
            isUnlimited: modalQuotaType === 'unlimited',
            reason: modalReason.trim()
          })
        });
      }

      setIsModalOpen(false);
      fetchUserQuotas();
    } catch (err) {
      setModalError(err.message || 'Lỗi cập nhật quota.');
    } finally {
      setIsSubmittingQuota(false);
    }
  };

  // Handle Purge Retention
  const handlePurgeRetention = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn dọn dẹp câu hỏi gốc cũ hơn 90 ngày? Thao tác này sẽ ẩn nội dung raw question nhưng giữ nguyên thống kê số token và chi phí.')) {
      return;
    }
    setIsPurging(true);
    try {
      const res = await fetchWithAuth('/api/ai-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge-retention', retentionDays: 90 })
      });
      alert(`Đã dọn dẹp thành công ${res.purgedCount} câu hỏi cũ.`);
      fetchResearch();
    } catch (err) {
      alert(`Lỗi dọn dẹp: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const statusBadge = (st) => {
    if (st === 'completed') return <span className="data-status data-status--good" style={{ background: 'var(--good-green-bg)', color: 'var(--good-green-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Thành công</span>;
    if (st === 'failed') return <span className="data-status data-status--bad" style={{ background: 'var(--bad-red-bg)', color: 'var(--bad-red-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Thất bại</span>;
    if (st === 'aborted') return <span className="data-status" style={{ background: 'rgba(156, 163, 175, 0.2)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Đã hủy</span>;
    if (st === 'rejected_by_quota') return <span className="data-status" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Chặn Quota</span>;
    return <span className="data-status">{st}</span>;
  };

  return (
    <div className="ai-ops-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Subtabs Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`btn-secondary ${activeSubtab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('overview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: activeSubtab === 'overview' ? 700 : 500,
              background: activeSubtab === 'overview' ? 'var(--ghn-orange)' : 'var(--card-bg)',
              color: activeSubtab === 'overview' ? 'white' : 'var(--text-main)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Activity size={16} /> Tổng Quan Chi Phí & API
          </button>

          <button
            type="button"
            className={`btn-secondary ${activeSubtab === 'quotas' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('quotas')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: activeSubtab === 'quotas' ? 700 : 500,
              background: activeSubtab === 'quotas' ? 'var(--ghn-orange)' : 'var(--card-bg)',
              color: activeSubtab === 'quotas' ? 'white' : 'var(--text-main)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Users size={16} /> Quản Lý Quota User
          </button>

          <button
            type="button"
            className={`btn-secondary ${activeSubtab === 'research' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('research')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: activeSubtab === 'research' ? 700 : 500,
              background: activeSubtab === 'research' ? 'var(--ghn-orange)' : 'var(--card-bg)',
              color: activeSubtab === 'research' ? 'white' : 'var(--text-main)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Bot size={16} /> Nghiên Cứu Câu Hỏi
          </button>
        </div>

        {/* Date Filter & Refresh (for Overview & Research) */}
        {activeSubtab !== 'quotas' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setDateRange('today')}
                style={{
                  background: dateRange === 'today' ? 'var(--card-bg)' : 'transparent',
                  color: dateRange === 'today' ? 'var(--ghn-orange)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: dateRange === 'today' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >Hôm nay</button>
              <button
                type="button"
                onClick={() => setDateRange('7d')}
                style={{
                  background: dateRange === '7d' ? 'var(--card-bg)' : 'transparent',
                  color: dateRange === '7d' ? 'var(--ghn-orange)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: dateRange === '7d' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >7 ngày</button>
              <button
                type="button"
                onClick={() => setDateRange('month')}
                style={{
                  background: dateRange === 'month' ? 'var(--card-bg)' : 'transparent',
                  color: dateRange === 'month' ? 'var(--ghn-orange)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: dateRange === 'month' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >Tháng này</button>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={activeSubtab === 'overview' ? fetchOverview : fetchResearch}
              disabled={isOverviewLoading || isResearchLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} className={isOverviewLoading || isResearchLoading ? 'spin' : ''} />
              Làm mới
            </button>
          </div>
        )}
      </div>

      {/* ======================= TAB 1: OVERVIEW ======================= */}
      {activeSubtab === 'overview' && (
        <div>
          {devChatConfig?.allowedModels?.length > 0 && (
            <section className="dev-chat-config" aria-labelledby="dev-chat-config-title">
              <div className="dev-chat-config__heading">
                <div>
                  <h2 id="dev-chat-config-title">Cấu hình chatbot</h2>
                  <p>Chỉ áp dụng cho phiên kiểm thử của Dev Admin trên trình duyệt này.</p>
                </div>
                <button type="button" className="dev-chat-config__reset" onClick={resetDevChatConfig}>Khôi phục mặc định</button>
              </div>
              <div className="dev-chat-config__controls">
                <label>
                  <span>Model</span>
                  <select value={selectedDevModel} onChange={handleDevModelChange}>
                    {devChatConfig.allowedModels.map(model => (
                      <option key={model.id} value={model.id}>{model.label}{model.id === devChatConfig.defaultModel ? ' (mặc định)' : ''}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Reasoning</span>
                  {(() => {
                    const model = devChatConfig.allowedModels.find(candidate => candidate.id === selectedDevModel);
                    if (!model?.reasoningEfforts?.length) return <output>Model này không hỗ trợ reasoning.</output>;
                    return (
                      <select value={selectedDevReasoning} onChange={handleDevReasoningChange}>
                        {model.reasoningEfforts.map(effort => <option key={effort} value={effort}>{REASONING_LABELS[effort] || effort}</option>)}
                      </select>
                    );
                  })()}
                </label>
              </div>
            </section>
          )}
          {isOverviewLoading && !overviewData ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Đang tải số liệu tổng quan chi phí AI...</div>
          ) : overviewError ? (
            <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger-fg)', borderRadius: '8px' }}>
              <AlertCircle size={16} /> {overviewError}
            </div>
          ) : overviewData && (
            <>
              {/* 4 Top KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                
                {/* Requests KPI */}
                <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG SỐ REQUESTS</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.4rem 0' }}>
                    {overviewData.totalRequests.toLocaleString('vi-VN')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#10b981' }}>✓ {overviewData.byStatus.completed}</span>
                    <span style={{ color: '#ef4444' }}>✗ {overviewData.byStatus.failed}</span>
                    <span style={{ color: '#6b7280' }}>⏹ {overviewData.byStatus.aborted}</span>
                    <span style={{ color: '#d97706' }}>🚫 {overviewData.byStatus.rejected_by_quota}</span>
                  </div>
                </div>

                {/* Active Users KPI */}
                <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>USER HOẠT ĐỘNG</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--ghn-orange)', margin: '0.4rem 0' }}>
                    {overviewData.activeUsersCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Số người dùng duy nhất đã gọi chatbot</div>
                </div>

                {/* Tokens KPI */}
                <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG TOKENS TIÊU THỤ</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.4rem 0' }}>
                    {overviewData.totalTokens.total.toLocaleString('vi-VN')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    In: {overviewData.totalTokens.input.toLocaleString('vi-VN')} · Out: {overviewData.totalTokens.output.toLocaleString('vi-VN')}
                  </div>
                </div>

                {/* Total Cost USD KPI */}
                <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG CHI PHÍ API (USD)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', margin: '0.4rem 0' }}>
                    {overviewData.totalCostFormatted}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {overviewData.totalCostMicrousd.toLocaleString('vi-VN')} micro-USD (tính chuẩn số nguyên)
                  </div>
                </div>
              </div>

              {/* Breakdown Tables Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
                
                {/* Model Breakdown */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700 }}>
                    CHI PHÍ & LƯỢT GỌI THEO MODEL
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Model</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Requests</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Tokens</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Chi Phí (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.modelBreakdown.length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có dữ liệu</td></tr>
                        ) : overviewData.modelBreakdown.map(m => (
                          <tr key={m.model} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{m.model}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>{m.requests}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>{m.totalTokens.toLocaleString('vi-VN')}</td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#10b981' }}>{m.costFormatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Daily Breakdown */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700 }}>
                    THỐNG KÊ THEO NGÀY
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Ngày</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Requests</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Users</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Chi Phí (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.dailyBreakdown.length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có dữ liệu ngày</td></tr>
                        ) : overviewData.dailyBreakdown.map(d => (
                          <tr key={d.date} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{d.date}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>{d.requests}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>{d.activeUsers}</td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#10b981' }}>{d.costFormatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* ======================= TAB 2: USER QUOTAS ======================= */}
      {activeSubtab === 'quotas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Top Bar: Search & Default Quota Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', width: '320px' }}>
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Tìm user theo email..."
                value={quotaSearch}
                onChange={(e) => setQuotaSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchUserQuotas()}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-main)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Hạn mức mặc định: <strong>{quotasData.defaultTurnLimit} lượt / ngày</strong>
              </div>
              <button
                type="button"
                className="nav-btn primary"
                onClick={() => {
                  setModalTargetUser({ email: '', originalEmail: '', userId: null });
                  setModalQuotaType('custom');
                  setModalCustomLimit(20);
                  setModalReason('');
                  setModalError('');
                  setIsModalOpen(true);
                }}
                style={{ fontSize: '0.85rem' }}
              >
                + Thêm Quota Riêng Cho User
              </button>
            </div>
          </div>

          {/* User Overrides Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>DANH SÁCH USER CÓ HẠN MỨC RIÊNG ({quotasData.overrides.length})</span>
              <button type="button" className="btn-secondary" onClick={fetchUserQuotas} disabled={isQuotasLoading} style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                <RefreshCw size={12} className={isQuotasLoading ? 'spin' : ''} /> Làm mới
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Email User</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Hạn Mức Riêng</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Đã dùng hôm nay</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Còn lại</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Lý Do Cấp</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Người chỉnh</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {isQuotasLoading && quotasData.overrides.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải danh sách...</td></tr>
                  ) : quotasData.overrides.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có user nào được cấp quota riêng. Mọi user đang dùng hạn mức mặc định 10 lượt/ngày.</td></tr>
                  ) : quotasData.overrides.map(u => (
                    <tr key={u.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{u.userEmail}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.isUnlimited ? (
                          <span style={{ color: '#10b981', fontWeight: 700 }}>Không giới hạn</span>
                        ) : (
                          <span style={{ fontWeight: 700 }}>{u.dailyTurnLimit} lượt/ngày</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{u.usedToday}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{u.isUnlimited ? '∞' : u.remainingTurns}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', maxWidth: '250px' }} className="truncate" title={u.reason}>{u.reason}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.updatedBy}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setModalTargetUser({ email: u.userEmail, originalEmail: u.userEmail, userId: u.userId });
                            setModalQuotaType(u.isUnlimited ? 'unlimited' : 'custom');
                            setModalCustomLimit(u.dailyTurnLimit || 20);
                            setModalReason('');
                            setModalError('');
                            setIsModalOpen(true);
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          Sửa / Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Trail Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700 }}>
              NHẬT KÝ THAY ĐỔI QUOTA (AUDIT TRAIL)
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 1rem' }}>Thời gian</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Người đổi</th>
                    <th style={{ padding: '0.6rem 1rem' }}>User</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Thao tác</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Hạn mức</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {quotasData.auditLogs.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có thay đổi nào được ghi nhận.</td></tr>
                  ) : quotasData.auditLogs.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 1rem' }}>{new Date(a.created_at).toLocaleString('vi-VN')}</td>
                      <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{a.changed_by}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>{a.user_email}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        {a.action === 'reset_default' ? (
                          <span style={{ color: '#d97706' }}>Reset Default (10)</span>
                        ) : (
                          <span style={{ color: '#10b981' }}>Set Override</span>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        {a.previous_is_unlimited ? '∞' : (a.previous_limit ?? '10')} → {a.new_is_unlimited ? '∞' : a.new_limit}
                      </td>
                      <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ======================= TAB 3: QUESTION RESEARCH ======================= */}
      {activeSubtab === 'research' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Filter & Actions Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: 'var(--card-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
              
              {/* Search question text */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-hover)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '260px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Tìm nội dung câu hỏi..."
                  value={researchSearch}
                  onChange={(e) => setResearchSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchResearch()}
                  style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              {/* Status Filter */}
              <select
                value={researchStatusFilter}
                onChange={(e) => setResearchStatusFilter(e.target.value)}
                style={{ background: 'var(--surface-hover)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="completed">Thành công (Completed)</option>
                <option value="failed">Thất bại (Failed)</option>
                <option value="aborted">Đã dừng (Aborted)</option>
                <option value="rejected_by_quota">Chặn Quota</option>
              </select>

              <button type="button" className="btn-secondary" onClick={fetchResearch} style={{ fontSize: '0.85rem' }}>
                Lọc dữ liệu
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="nav-btn primary"
                onClick={handleExportCsv}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <Download size={14} /> Xuất CSV Nghiên Cứu
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handlePurgeRetention}
                disabled={isPurging}
                title="Dọn dẹp raw questions cũ hơn 90 ngày theo retention policy"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}
              >
                <Trash2 size={14} /> Purge Retention (&gt;90d)
              </button>
            </div>
          </div>

          {/* Research Insights Summary */}
          {researchTopFingerprints.length > 0 && (
            <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} color="var(--ghn-orange)" /> CÁC CÂU HỎI LẶP LẠI PHỔ BIẾN TRONG KỲ
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {researchTopFingerprints.map(fp => (
                  <span key={fp.fingerprint} style={{ background: 'var(--surface-hover)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                    Fingerprint <code>#{fp.fingerprint}</code>: <strong>{fp.count} lần</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Research Questions Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>DANH SÁCH CÂU HỎI NGHIÊN CỨU ({researchTotal.toLocaleString('vi-VN')})</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Email người dùng đã được tự động mask</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Thời gian</th>
                    <th style={{ padding: '0.75rem 1rem' }}>User</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Nội dung câu hỏi</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Trạng thái</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Model</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Latency</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Tokens</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Chi Phí (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {isResearchLoading && researchLogs.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải nhật ký câu hỏi...</td></tr>
                  ) : researchError ? (
                    <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--status-danger-fg)' }}>{researchError}</td></tr>
                  ) : researchLogs.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có câu hỏi nào trong khoảng thời gian đã chọn.</td></tr>
                  ) : researchLogs.map(r => {
                    const isExpanded = expandedQuestionId === r.requestId;
                    return (
                      <React.Fragment key={r.requestId}>
                        <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setExpandedQuestionId(isExpanded ? null : r.requestId)}>
                          <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                            {r.startedAt ? new Date(r.startedAt).toLocaleString('vi-VN') : ''}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.maskedUser}</td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '350px' }} className={isExpanded ? '' : 'truncate'}>
                            {r.question}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(r.status)}</td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>{r.model}</td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>{r.latencyMs}ms</td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                            {r.totalTokens} <span style={{ color: 'var(--text-muted)' }}>({r.inputTokens} in / {r.outputTokens} out)</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#10b981' }}>{r.costFormatted}</td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={8} style={{ padding: '1rem', fontSize: '0.82rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <div><strong>Toàn bộ câu hỏi:</strong> {r.question}</div>
                                {r.toolNames?.length > 0 && (
                                  <div><strong>Công cụ DB đã gọi:</strong> {r.toolNames.join(', ')}</div>
                                )}
                                <div><strong>Fingerprint:</strong> <code>{r.questionFingerprint || 'None'}</code></div>
                                <div><strong>Request ID:</strong> <code>{r.requestId}</code></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ======================= MODAL: SET / RESET QUOTA ======================= */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', width: '100%', maxWidth: '480px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} color="var(--ghn-orange)" />
                Thiết Lập Quota User
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger-fg)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmitQuota} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  Email User:
                </label>
                <input
                  type="email"
                  required
                  placeholder="ví dụ: user@ghn.vn"
                  value={modalTargetUser?.email || ''}
                  onChange={(e) => setModalTargetUser(prev => ({
                    ...prev,
                    email: e.target.value,
                    userId: (prev?.originalEmail && prev.originalEmail.toLowerCase() === e.target.value.trim().toLowerCase()) ? prev.userId : null
                  }))}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  Loại Hạn Mức:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="quotaType"
                      value="custom"
                      checked={modalQuotaType === 'custom'}
                      onChange={() => setModalQuotaType('custom')}
                    />
                    Đặt số lượt cụ thể mỗi ngày
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="quotaType"
                      value="unlimited"
                      checked={modalQuotaType === 'unlimited'}
                      onChange={() => setModalQuotaType('unlimited')}
                    />
                    Không giới hạn (Unlimited)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="quotaType"
                      value="default"
                      checked={modalQuotaType === 'default'}
                      onChange={() => setModalQuotaType('default')}
                    />
                    Đặt lại về mặc định (10 lượt/ngày)
                  </label>
                </div>
              </div>

              {modalQuotaType === 'custom' && (
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                    Số lượt / ngày:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={modalCustomLimit}
                    onChange={(e) => setModalCustomLimit(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  Lý do thay đổi (bắt buộc để audit):
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ví dụ: Phục vụ đối soát chiến dịch 9.9, nghiên cứu dữ liệu leadtime..."
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmittingQuota}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="nav-btn primary"
                  disabled={isSubmittingQuota}
                >
                  {isSubmittingQuota ? 'Đang cập nhật...' : 'Xác Nhận Thay Đổi'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
