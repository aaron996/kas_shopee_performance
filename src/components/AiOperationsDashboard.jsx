import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import {
  getModelConfigTargetKey,
  getInheritanceLabel,
  shouldAcceptConfigResponse,
  shouldApplyMutationResponse,
  isModelConfigActionEnabled
} from '../utils/aiModelConfigTarget';

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
  const [activeSubtab, setActiveSubtab] = useState('overview'); // 'overview' | 'quotas' | 'model-config' | 'research'

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

  // Model Config State
  const [targetScope, setTargetScope] = useState('all'); // 'all' | 'user'
  const [selectedUser, setSelectedUser] = useState(null); // { userId, email } | null
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [userSearchError, setUserSearchError] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const userSearchContainerRef = useRef(null);

  const [modelConfigData, setModelConfigData] = useState(null);
  const [loadedTargetKey, setLoadedTargetKey] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isModelConfigLoading, setIsModelConfigLoading] = useState(false);
  const [modelConfigError, setModelConfigError] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formReasoningEffort, setFormReasoningEffort] = useState(null);
  const [formReason, setFormReason] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState(null);
  const [showAllConfirmModal, setShowAllConfirmModal] = useState(false);

  const requestSeqRef = useRef(0);
  const activeControllerRef = useRef(null);

  const currentTargetKey = useMemo(
    () => getModelConfigTargetKey(targetScope, selectedUser),
    [targetScope, selectedUser]
  );
  const currentTargetKeyRef = useRef(currentTargetKey);

  useEffect(() => {
    currentTargetKeyRef.current = currentTargetKey;
  }, [currentTargetKey]);

  // Click-outside listener for accessible user search combobox
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userSearchContainerRef.current && !userSearchContainerRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  // Debounced User Search for Model Config
  useEffect(() => {
    if (!userSearchTerm.trim()) {
      setUserSearchResults([]);
      setIsSearchingUsers(false);
      setHighlightedIndex(-1);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      setUserSearchError('');
      try {
        const data = await fetchWithAuth(`/api/ai-ops?view=model-users&search=${encodeURIComponent(userSearchTerm.trim())}`);
        setUserSearchResults(data.users || []);
        setIsUserMenuOpen(true);
        setHighlightedIndex(-1);
      } catch (err) {
        setUserSearchError(err.message || 'Lỗi tìm kiếm user.');
      } finally {
        setIsSearchingUsers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearchTerm, fetchWithAuth]);

  const handleSelectScope = (scope) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    requestSeqRef.current += 1;
    setModelConfigData(null);
    setLoadedTargetKey(null);
    setFormModel('');
    setFormReasoningEffort(null);
    setModelConfigError('');
    setConfigFeedback(null);
    setFormReason('');
    setHighlightedIndex(-1);

    setTargetScope(scope);
    if (scope === 'all') {
      setSelectedUser(null);
      setUserSearchTerm('');
      setIsUserMenuOpen(false);
    }
  };

  const handleSelectUser = (user) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    requestSeqRef.current += 1;
    setModelConfigData(null);
    setLoadedTargetKey(null);
    setFormModel('');
    setFormReasoningEffort(null);
    setModelConfigError('');
    setConfigFeedback(null);
    setFormReason('');
    setHighlightedIndex(-1);
    setIsUserMenuOpen(false);

    setTargetScope('user');
    setSelectedUser(user);
    setUserSearchTerm(user.email);
  };

  const handleUserSearchKeyDown = (e) => {
    if (!isUserMenuOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsUserMenuOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (userSearchResults.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % userSearchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (userSearchResults.length > 0) {
        setHighlightedIndex(prev => (prev - 1 + userSearchResults.length) % userSearchResults.length);
      }
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < userSearchResults.length) {
        e.preventDefault();
        handleSelectUser(userSearchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsUserMenuOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleModelChange = (newModelId) => {
    setFormModel(newModelId);
    const modelDef = modelConfigData?.allowedModels?.find(m => m.id === newModelId);
    if (!modelDef || !modelDef.reasoningEfforts || modelDef.reasoningEfforts.length === 0) {
      setFormReasoningEffort(null);
    } else if (formReasoningEffort && modelDef.reasoningEfforts.includes(formReasoningEffort)) {
      // keep compatible reasoning
    } else {
      setFormReasoningEffort(modelDef.defaultReasoningEffort || modelDef.reasoningEfforts[0] || null);
    }
  };

  const isApplyEnabled = useMemo(() => {
    return isModelConfigActionEnabled({
      scope: targetScope,
      user: selectedUser,
      modelConfigData,
      loadedTargetKey,
      currentTargetKey,
      formModel,
      formReasoningEffort,
      formReason,
      isModelConfigLoading,
      isSavingConfig,
      modelConfigError,
      actionType: 'apply'
    });
  }, [
    targetScope,
    selectedUser,
    modelConfigData,
    loadedTargetKey,
    currentTargetKey,
    formModel,
    formReasoningEffort,
    formReason,
    isModelConfigLoading,
    isSavingConfig,
    modelConfigError
  ]);

  const isResetEnabled = useMemo(() => {
    return isModelConfigActionEnabled({
      scope: targetScope,
      user: selectedUser,
      modelConfigData,
      loadedTargetKey,
      currentTargetKey,
      formModel,
      formReasoningEffort,
      formReason,
      isModelConfigLoading,
      isSavingConfig,
      modelConfigError,
      actionType: 'reset'
    });
  }, [
    targetScope,
    selectedUser,
    modelConfigData,
    loadedTargetKey,
    currentTargetKey,
    formModel,
    formReasoningEffort,
    formReason,
    isModelConfigLoading,
    isSavingConfig,
    modelConfigError
  ]);

  const handleApplyConfig = async () => {
    if (!isApplyEnabled) {
      if (!formReason.trim()) {
        setConfigFeedback({ type: 'error', message: 'Vui lòng nhập lý do thay đổi để lưu audit trail.' });
      }
      return;
    }
    if (targetScope === 'all' && !showAllConfirmModal) {
      setShowAllConfirmModal(true);
      return;
    }
    setShowAllConfirmModal(false);
    setIsSavingConfig(true);
    setConfigFeedback(null);

    const mutationTargetKey = currentTargetKey;
    const mutationScope = targetScope;
    const mutationUser = selectedUser;

    try {
      const modelDef = modelConfigData?.allowedModels?.find(m => m.id === formModel);
      const hasReasoning = Boolean(modelDef?.reasoningEfforts && modelDef.reasoningEfforts.length > 0);
      const effReasoning = hasReasoning ? formReasoningEffort : null;

      await fetchWithAuth('/api/ai-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-model-config',
          scopeType: mutationScope,
          userId: mutationScope === 'user' ? mutationUser?.userId : null,
          userEmail: mutationScope === 'user' ? mutationUser?.email : null,
          model: formModel,
          reasoningEffort: effReasoning,
          reason: formReason.trim()
        })
      });

      if (!shouldApplyMutationResponse({
        mutationTargetKey,
        currentTargetKey: currentTargetKeyRef.current
      })) {
        return;
      }

      setFormReason('');
      setConfigFeedback({
        type: 'success',
        message: `Đã áp dụng cấu hình cho ${mutationScope === 'all' ? 'Tất cả người dùng (All)' : mutationUser?.email} thành công!`
      });
      setReloadNonce(n => n + 1);
    } catch (err) {
      if (shouldApplyMutationResponse({
        mutationTargetKey,
        currentTargetKey: currentTargetKeyRef.current
      })) {
        setConfigFeedback({ type: 'error', message: err.message || 'Lỗi cập nhật cấu hình.' });
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleResetConfig = async () => {
    if (!isResetEnabled) {
      if (!formReason.trim()) {
        setConfigFeedback({ type: 'error', message: 'Vui lòng nhập lý do đặt lại để lưu audit trail.' });
      }
      return;
    }

    const confirmMsg = targetScope === 'all'
      ? 'Bạn có chắc chắn muốn khôi phục cấu hình "All" về mặc định server?'
      : `Bạn có chắc chắn muốn xóa cấu hình riêng của ${selectedUser?.email} để quay về kế thừa All?`;
    if (!window.confirm(confirmMsg)) return;

    setIsSavingConfig(true);
    setConfigFeedback(null);

    const mutationTargetKey = currentTargetKey;
    const mutationScope = targetScope;
    const mutationUser = selectedUser;

    try {
      await fetchWithAuth('/api/ai-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-model-config',
          scopeType: mutationScope,
          userId: mutationScope === 'user' ? mutationUser?.userId : null,
          userEmail: mutationScope === 'user' ? mutationUser?.email : null,
          reason: formReason.trim()
        })
      });

      if (!shouldApplyMutationResponse({
        mutationTargetKey,
        currentTargetKey: currentTargetKeyRef.current
      })) {
        return;
      }

      setFormReason('');
      setConfigFeedback({
        type: 'success',
        message: `Đã khôi phục mặc định thành công cho ${mutationScope === 'all' ? 'Tất cả người dùng (All)' : mutationUser?.email}!`
      });
      setReloadNonce(n => n + 1);
    } catch (err) {
      if (shouldApplyMutationResponse({
        mutationTargetKey,
        currentTargetKey: currentTargetKeyRef.current
      })) {
        setConfigFeedback({ type: 'error', message: err.message || 'Lỗi khôi phục cấu hình.' });
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Dedicated Model Config Fetch Effect with AbortController, sequence tracking & target validation
  useEffect(() => {
    if (activeSubtab !== 'model-config') return;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const thisSeq = ++requestSeqRef.current;
    const thisTargetKey = currentTargetKey;

    setIsModelConfigLoading(true);
    setModelConfigError('');

    const targetUserId = (targetScope === 'user' && selectedUser?.userId) ? selectedUser.userId : null;
    const url = `/api/ai-ops?view=model-config${targetUserId ? `&userId=${encodeURIComponent(targetUserId)}` : ''}`;

    fetchWithAuth(url, { signal: controller.signal })
      .then((data) => {
        if (!shouldAcceptConfigResponse({
          requestSeq: thisSeq,
          activeSeq: requestSeqRef.current,
          responseTargetKey: thisTargetKey,
          currentTargetKey: currentTargetKeyRef.current,
          isAborted: controller.signal.aborted
        })) {
          return;
        }

        setModelConfigData(data);
        setLoadedTargetKey(thisTargetKey);

        if (targetScope === 'user' && !selectedUser) {
          setFormModel('');
          setFormReasoningEffort(null);
        } else {
          const activeSetting = targetUserId
            ? (data.targetConfig || data.globalConfig || data.envDefault)
            : (data.globalConfig || data.envDefault);
          const chosenModel = activeSetting?.model || data.envDefault?.model || (data.allowedModels?.[0]?.id ?? '');
          const chosenReasoning = activeSetting ? activeSetting.reasoningEffort : (data.envDefault?.reasoningEffort ?? null);
          setFormModel(chosenModel);
          setFormReasoningEffort(chosenReasoning ?? null);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        if (requestSeqRef.current === thisSeq) {
          setModelConfigError(err.message || 'Không thể tải cấu hình chatbot.');
          setModelConfigData(null);
          setLoadedTargetKey(null);
          setFormModel('');
          setFormReasoningEffort(null);
        }
      })
      .finally(() => {
        if (requestSeqRef.current === thisSeq) {
          setIsModelConfigLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [activeSubtab, currentTargetKey, reloadNonce, fetchWithAuth, targetScope, selectedUser]);

  // Load active tab data (Overview, Quotas, Research)
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
            className={`btn-secondary ${activeSubtab === 'model-config' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('model-config')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: activeSubtab === 'model-config' ? 700 : 500,
              background: activeSubtab === 'model-config' ? 'var(--ghn-orange)' : 'var(--card-bg)',
              color: activeSubtab === 'model-config' ? 'white' : 'var(--text-main)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={16} /> Cấu Hình Chatbot
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
        {activeSubtab !== 'quotas' && activeSubtab !== 'model-config' && (
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

      {/* ======================= TAB 2: MODEL & REASONING CONFIGURATION ======================= */}
      {activeSubtab === 'model-config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Header Banner & Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            background: 'var(--card-bg)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Bot size={22} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Cấu Hình Mô Hình & Suy Luận AI (Model & Reasoning)
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Quản lý model AI phục vụ toàn hệ thống (All) hoặc override riêng cho từng nhân sự / phòng ban.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReloadNonce(n => n + 1)}
                disabled={isModelConfigLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <RefreshCw size={14} className={isModelConfigLoading ? 'spin' : ''} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Precedence Policy Info Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            fontSize: '0.85rem',
            color: 'var(--text-main)'
          }}>
            <Shield size={18} color="#3b82f6" style={{ marginTop: '0.15rem', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: '#2563eb' }}>
                Thứ tự phân cấp cấu hình (Precedence Order):
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700, padding: '0.2rem 0.5rem' }}>
                  1. Cấu hình User cụ thể
                </span>
                <span style={{ color: 'var(--text-muted)' }}>➔</span>
                <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 700, padding: '0.2rem 0.5rem' }}>
                  2. Cấu hình Toàn hệ thống (All)
                </span>
                <span style={{ color: 'var(--text-muted)' }}>➔</span>
                <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563', fontWeight: 700, padding: '0.2rem 0.5rem' }}>
                  3. Mặc định Server Env (Dự phòng)
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                * Bảo mật tuyệt đối: Client không được gửi model/reasoning. Các model không hỗ trợ suy luận sẽ tự động bỏ qua reasoning effort. Thay đổi được áp dụng ngay lập tức mà user không cần reload.
              </div>
            </div>
          </div>

          {modelConfigError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.9rem 1.25rem',
              borderRadius: '8px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{modelConfigError}</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReloadNonce(n => n + 1)}
                disabled={isModelConfigLoading}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#991b1b', borderColor: '#fca5a5' }}
              >
                Thử lại
              </button>
            </div>
          )}

          {isModelConfigLoading && !modelConfigData ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem 2rem',
              gap: '1rem',
              color: 'var(--text-muted)',
              background: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <RefreshCw size={28} className="spin" />
              <span style={{ fontSize: '0.9rem' }}>Đang tải cấu hình AI Model & Phân cấp...</span>
            </div>
          ) : modelConfigError && !modelConfigData ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3rem 2rem',
              gap: '0.75rem',
              color: 'var(--text-muted)',
              background: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <AlertCircle size={32} color="#ef4444" />
              <span style={{ fontSize: '0.9rem', color: '#991b1b', fontWeight: 600 }}>Không thể tải dữ liệu cấu hình model</span>
              <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--text-muted)' }}>Vui lòng kiểm tra kết nối hoặc quyền truy cập và thử lại.</p>
              <button
                type="button"
                className="nav-btn primary"
                onClick={() => setReloadNonce(n => n + 1)}
                style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}
              >
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {/* Main 2-Column Section */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>

            {/* Left Column: Form Configuration */}
            <div style={{
              background: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Thiết Lập Model & Suy Luận
                </h4>
              </div>

              {/* Scope Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  1. Chọn phạm vi áp dụng (Scope)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectScope('all')}
                    disabled={isModelConfigLoading || isSavingConfig}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: targetScope === 'all' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: targetScope === 'all' ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface-hover)',
                      color: targetScope === 'all' ? 'var(--primary)' : 'var(--text-main)',
                      fontWeight: targetScope === 'all' ? 700 : 500,
                      cursor: (isModelConfigLoading || isSavingConfig) ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: (isModelConfigLoading || isSavingConfig) ? 0.7 : 1
                    }}
                  >
                    <Users size={18} />
                    <div>
                      <div>Tất cả (All Users)</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>Cấu hình chung hệ thống</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectScope('user')}
                    disabled={isModelConfigLoading || isSavingConfig}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: targetScope === 'user' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: targetScope === 'user' ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface-hover)',
                      color: targetScope === 'user' ? 'var(--primary)' : 'var(--text-main)',
                      fontWeight: targetScope === 'user' ? 700 : 500,
                      cursor: (isModelConfigLoading || isSavingConfig) ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: (isModelConfigLoading || isSavingConfig) ? 0.7 : 1
                    }}
                  >
                    <UserCheck size={18} />
                    <div>
                      <div>Người dùng cụ thể</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>Override cho 1 user</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* User Search & Selection (if scope === 'user') */}
              {targetScope === 'user' && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  padding: '1rem',
                  background: 'var(--surface-hover)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border)'
                }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    2. Tìm & Chọn người dùng
                  </label>

                  {selectedUser ? (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--card-bg)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedUser.email}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {selectedUser.userId}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isModelConfigLoading || isSavingConfig}
                        onClick={() => {
                          if (activeControllerRef.current) {
                            activeControllerRef.current.abort();
                            activeControllerRef.current = null;
                          }
                          requestSeqRef.current += 1;
                          setModelConfigData(null);
                          setLoadedTargetKey(null);
                          setFormModel('');
                          setFormReasoningEffort(null);
                          setModelConfigError('');
                          setConfigFeedback(null);
                          setFormReason('');
                          setSelectedUser(null);
                          setUserSearchTerm('');
                          setHighlightedIndex(-1);
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        Đổi user
                      </button>
                    </div>
                  ) : (
                    <div ref={userSearchContainerRef} style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <Search size={15} color="var(--text-muted)" />
                        <input
                          type="text"
                          role="combobox"
                          aria-expanded={isUserMenuOpen}
                          aria-controls="user-search-listbox"
                          aria-autocomplete="list"
                          aria-activedescendant={
                            highlightedIndex >= 0 && userSearchResults[highlightedIndex]
                              ? `user-option-${userSearchResults[highlightedIndex].userId}`
                              : undefined
                          }
                          placeholder="Nhập email nhân viên để tìm kiếm..."
                          value={userSearchTerm}
                          disabled={isModelConfigLoading || isSavingConfig}
                          onChange={(e) => {
                            setUserSearchTerm(e.target.value);
                            setIsUserMenuOpen(true);
                            setHighlightedIndex(-1);
                          }}
                          onFocus={() => {
                            if (userSearchTerm.trim() || userSearchResults.length > 0) {
                              setIsUserMenuOpen(true);
                            }
                          }}
                          onKeyDown={handleUserSearchKeyDown}
                          style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-main)', fontSize: '0.85rem' }}
                        />
                        {isSearchingUsers && <RefreshCw size={14} className="spin" />}
                      </div>

                      {userSearchError && (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                          {userSearchError}
                        </div>
                      )}

                      {/* Dropdown search results */}
                      {isUserMenuOpen && Boolean(userSearchTerm.trim()) && (
                        <div
                          id="user-search-listbox"
                          role="listbox"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: '4px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                            maxHeight: '220px',
                            overflowY: 'auto',
                            zIndex: 50
                          }}
                        >
                          {isSearchingUsers ? (
                            <div style={{ padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              <RefreshCw size={14} className="spin" />
                              <span>Đang tìm kiếm người dùng...</span>
                            </div>
                          ) : userSearchResults.length === 0 ? (
                            <div style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                              Không tìm thấy người dùng nào phù hợp
                            </div>
                          ) : (
                            userSearchResults.map((u, idx) => {
                              const isHighlighted = highlightedIndex === idx;
                              return (
                                <div
                                  key={u.userId}
                                  id={`user-option-${u.userId}`}
                                  role="option"
                                  aria-selected={isHighlighted}
                                  onClick={() => handleSelectUser(u)}
                                  onMouseEnter={() => setHighlightedIndex(idx)}
                                  style={{
                                    padding: '0.6rem 0.85rem',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border)',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: isHighlighted ? 'var(--surface-hover)' : 'transparent'
                                  }}
                                >
                                  <span style={{ fontWeight: 600 }}>{u.email}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.userId.slice(0, 8)}...</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedUser && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {modelConfigData?.targetConfig ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                          ✓ Đang có override riêng: {modelConfigData.targetConfig.model} ({modelConfigData.targetConfig.reasoningEffort ? `suy luận: ${modelConfigData.targetConfig.reasoningEffort}` : 'không suy luận'})
                        </span>
                      ) : (
                        <span>ℹ Chưa có override riêng ({getInheritanceLabel(modelConfigData?.targetConfig, modelConfigData?.effectiveSource)}).</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Left Column Configuration Section */}
              {targetScope === 'user' && !selectedUser ? (
                <div style={{
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  background: 'var(--surface-hover)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem'
                }}>
                  <UserCheck size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    Chưa chọn người dùng cụ thể
                  </div>
                  <div>Vui lòng tìm kiếm email ở bước 2 hoặc bấm "Sửa" ở danh sách bên dưới để bắt đầu cấu hình.</div>
                </div>
              ) : (
                <>
                  {/* Model Selection */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {targetScope === 'user' ? '3.' : '2.'} Chọn Mô Hình (Model)
                    </label>
                    {(!modelConfigData?.allowedModels || modelConfigData.allowedModels.length === 0) ? (
                      <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Không có mô hình nào khả dụng từ cấu hình server.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem' }}>
                        {modelConfigData.allowedModels.map(m => {
                          const isSelected = formModel === m.id;
                          const hasReasoning = Boolean(m.reasoningEfforts && m.reasoningEfforts.length > 0);
                          const isModelDisabled = isModelConfigLoading || isSavingConfig;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={isModelDisabled}
                              onClick={() => handleModelChange(m.id)}
                              style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                background: isSelected ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface-hover)',
                                cursor: isModelDisabled ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.25rem',
                                textAlign: 'left',
                                color: 'inherit',
                                opacity: isModelDisabled ? 0.6 : 1
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                  {m.label || m.id}
                                </span>
                                {isSelected && <CheckCircle2 size={14} color="var(--primary)" />}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {hasReasoning ? 'Hỗ trợ reasoning' : 'Không hỗ trợ reasoning'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Reasoning Effort Selection */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {targetScope === 'user' ? '4.' : '3.'} Mức Độ Suy Luận (Reasoning Effort)
                    </label>

                    {(() => {
                      const currentModelDef = modelConfigData?.allowedModels?.find(m => m.id === formModel);
                      const currentHasReasoning = Boolean(currentModelDef?.reasoningEfforts && currentModelDef.reasoningEfforts.length > 0);

                      if (!currentHasReasoning) {
                        return (
                          <div style={{
                            padding: '0.6rem 0.85rem',
                            borderRadius: '6px',
                            background: 'var(--surface-hover)',
                            border: '1px dashed var(--border)',
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)'
                          }}>
                            Model <strong>{currentModelDef?.label || formModel}</strong> không hỗ trợ tham số suy luận (reasoning effort). Giá trị được cố định là <em>Không sử dụng</em>.
                          </div>
                        );
                      }

                      return (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${Math.min(currentModelDef.reasoningEfforts.length, 4)}, 1fr)`,
                          gap: '0.6rem'
                        }}>
                          {currentModelDef.reasoningEfforts.map(effort => {
                            const isSelected = formReasoningEffort === effort;
                            const label = REASONING_LABELS[effort] || effort;
                            const isEffortDisabled = isModelConfigLoading || isSavingConfig;
                            return (
                              <button
                                key={effort}
                                type="button"
                                disabled={isEffortDisabled}
                                onClick={() => setFormReasoningEffort(effort)}
                                style={{
                                  padding: '0.6rem 0.75rem',
                                  borderRadius: '8px',
                                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                  background: isSelected ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface-hover)',
                                  cursor: isEffortDisabled ? 'not-allowed' : 'pointer',
                                  textAlign: 'center',
                                  color: 'inherit',
                                  opacity: isEffortDisabled ? 0.6 : 1
                                }}
                              >
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                  {label}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({effort})</div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Reason for Audit Log */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {targetScope === 'user' ? '5.' : '4.'} Lý do thay đổi <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Nâng cấp GPT-5 phục vụ đối soát chiến dịch 9.9..."
                      value={formReason}
                      disabled={isModelConfigLoading || isSavingConfig}
                      onChange={(e) => setFormReason(e.target.value)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-hover)',
                        color: 'var(--text-main)',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Bắt buộc nhập để lưu vết kiểm toán (Audit Trail) cho Dev Admin.
                    </span>
                  </div>

                  {/* Feedback messages */}
                  {configFeedback && (
                    <div style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: configFeedback.type === 'success' ? '#dcfce7' : '#fee2e2',
                      color: configFeedback.type === 'success' ? '#166534' : '#991b1b',
                      border: configFeedback.type === 'success' ? '1px solid #86efac' : '1px solid #fca5a5'
                    }}>
                      {configFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{configFeedback.message}</span>
                    </div>
                  )}

                  {/* Actions Button Row */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {targetScope === 'user' && selectedUser && modelConfigData?.targetConfig && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleResetConfig}
                        disabled={!isResetEnabled}
                        style={{ fontSize: '0.85rem', color: '#d97706' }}
                      >
                        Gỡ bỏ override ({modelConfigData?.globalConfig ? 'Kế thừa All' : 'Kế thừa mặc định server'})
                      </button>
                    )}

                    {targetScope === 'all' && modelConfigData?.globalConfig && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleResetConfig}
                        disabled={!isResetEnabled}
                        style={{ fontSize: '0.85rem', color: '#64748b' }}
                      >
                        Khôi phục mặc định Env
                      </button>
                    )}

                    <button
                      type="button"
                      className="nav-btn primary"
                      onClick={handleApplyConfig}
                      disabled={!isApplyEnabled}
                      style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <Sparkles size={15} />
                      {isSavingConfig ? 'Đang lưu...' : targetScope === 'all' ? 'Áp dụng cho All Users' : 'Áp dụng cho User này'}
                    </button>
                  </div>
                </>
              )}

            </div>

            {/* Right Column: Status & Current Hierarchy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Effective Resolution Summary Card */}
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    Hiệu Lực Thực Tế ({targetScope === 'user' ? (selectedUser ? selectedUser.email : 'Chưa chọn user') : 'Phạm vi All'})
                  </span>
                  {!(targetScope === 'user' && !selectedUser) && (
                    <span className="badge" style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      background: modelConfigData?.effectiveSource === 'user' ? '#dbeafe' : modelConfigData?.effectiveSource === 'all' ? '#e0e7ff' : '#f3f4f6',
                      color: modelConfigData?.effectiveSource === 'user' ? '#1e40af' : modelConfigData?.effectiveSource === 'all' ? '#3730a3' : '#4b5563'
                    }}>
                      Nguồn: {modelConfigData?.effectiveSource === 'user' ? 'User Override' : modelConfigData?.effectiveSource === 'all' ? 'Toàn hệ thống (All)' : 'Mặc định Env'}
                    </span>
                  )}
                </div>

                {targetScope === 'user' && !selectedUser ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Chọn một người dùng cụ thể để xem cấu hình hiệu lực thực tế.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Model đang phục vụ</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.2rem' }}>
                        {modelConfigData?.effectiveConfig?.model || 'Đang tải...'}
                      </div>
                    </div>

                    <div style={{ padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mức suy luận</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                        {modelConfigData?.effectiveConfig?.reasoningEffort || 'Không (null)'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Global Config Card */}
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Cấu Hình Global (All) Trong Database</span>
                  {modelConfigData?.globalConfig ? (
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>● Đang kích hoạt</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>○ Chưa gán (kế thừa env)</span>
                  )}
                </div>

                {modelConfigData?.globalConfig ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                    <div>Model: <strong>{modelConfigData.globalConfig.model}</strong></div>
                    <div>Reasoning: <strong>{modelConfigData.globalConfig.reasoningEffort || 'Không'}</strong></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Cập nhật: {new Date(modelConfigData.globalConfig.updatedAt).toLocaleString('vi-VN')} ({modelConfigData.globalConfig.updatedBy || 'Dev Admin'})
                    </div>
                    {modelConfigData.globalConfig.reason && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Lý do: "{modelConfigData.globalConfig.reason}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Chưa có cấu hình Global lưu trong database. Hệ thống tự động sử dụng giá trị mặc định từ biến môi trường.
                  </div>
                )}
              </div>

              {/* Server Env Fallback Card */}
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Cấu Hình Mặc Định Server (Environment)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                  <div>Model Env: <code>{modelConfigData?.envDefault?.model || 'gpt-5.6-luna'}</code></div>
                  <div>Reasoning Env: <code>{modelConfigData?.envDefault?.reasoningEffort || 'null'}</code></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Được tải từ <code>AI_CHAT_MODEL</code> và <code>AI_CHAT_REASONING_EFFORT</code>.
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Active User Overrides Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>DANH SÁCH OVERRIDE RIÊNG CHO TỪNG USER</span>
              <span className="badge" style={{ fontSize: '0.75rem' }}>{modelConfigData?.userOverrides?.length || 0} user</span>
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 1rem' }}>User</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Model Override</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Reasoning</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Cập nhật lúc</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Người đổi</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Lý do</th>
                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(!modelConfigData?.userOverrides || modelConfigData.userOverrides.length === 0) ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Chưa có người dùng nào được cấu hình riêng. Tất cả đều đang tuân theo cấu hình Toàn hệ thống (All).
                      </td>
                    </tr>
                  ) : modelConfigData.userOverrides.map(u => (
                    <tr key={u.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{u.userEmail || u.userId}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <span className="badge" style={{ background: 'rgba(249, 115, 22, 0.1)', color: 'var(--primary)', fontWeight: 600 }}>
                          {u.model}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 1rem' }}>{u.reasoningEffort || 'Không'}</td>
                      <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>
                        {u.updatedAt ? new Date(u.updatedAt).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td style={{ padding: '0.6rem 1rem' }}>{u.updatedBy || 'Dev Admin'}</td>
                      <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>{u.reason || '-'}</td>
                      <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            handleSelectUser({ userId: u.userId, email: u.userEmail || u.userId });
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', marginRight: '0.4rem' }}
                        >
                          Sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Model Config Audit Trail Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700 }}>
              NHẬT KÝ THAY ĐỔI CẤU HÌNH AI MODEL (AUDIT TRAIL)
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 1rem' }}>Thời gian</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Người đổi</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Phạm vi</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Đối tượng</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Thao tác</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Cấu hình cũ ➔ Mới</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {(!modelConfigData?.recentAudits || modelConfigData.recentAudits.length === 0) ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Chưa có lịch sử thay đổi cấu hình nào được ghi nhận.
                      </td>
                    </tr>
                  ) : modelConfigData.recentAudits.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 1rem' }}>{new Date(a.createdAt).toLocaleString('vi-VN')}</td>
                      <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{a.changedBy}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <span className="badge" style={{
                          background: a.scopeType === 'all' ? '#e0e7ff' : '#dbeafe',
                          color: a.scopeType === 'all' ? '#3730a3' : '#1e40af',
                          fontWeight: 600
                        }}>
                          {a.scopeType === 'all' ? 'Toàn hệ thống' : 'User'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 1rem' }}>{a.userEmail || (a.scopeType === 'all' ? 'All' : a.userId)}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        {a.action === 'reset_default' ? (
                          <span style={{ color: '#d97706' }}>Khôi phục mặc định</span>
                        ) : (
                          <span style={{ color: '#059669' }}>Cập nhật</span>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        {a.previousModel || 'none'}:{a.previousReasoningEffort || 'none'} ➔ {a.newModel || 'none'}:{a.newReasoningEffort || 'none'}
                      </td>
                      <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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

      {/* Confirmation Modal for Scope 'All' (Global Model Configuration) */}
      {showAllConfirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            width: '90%',
            maxWidth: '520px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{
                background: '#fef3c7',
                borderRadius: '50%',
                padding: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ShieldAlert size={24} color="#d97706" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#b45309' }}>
                  Xác Nhận Thay Đổi Toàn Hệ Thống
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Bạn đang chuẩn bị áp dụng cấu hình mô hình mới cho <strong>TẤT CẢ người dùng (All Users)</strong>.
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--surface-hover)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mô hình mới (Model):</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{formModel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mức suy luận (Reasoning Effort):</span>
                <span style={{ fontWeight: 600 }}>{formReasoningEffort || 'Không áp dụng'}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Lý do ghi nhận kiểm toán:</div>
                <div style={{ fontStyle: 'italic', color: 'var(--text-main)' }}>"{formReason}"</div>
              </div>
            </div>

            <div style={{
              fontSize: '0.8rem',
              color: '#991b1b',
              background: '#fee2e2',
              padding: '0.6rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #fca5a5'
            }}>
              Lưu ý: Mọi user không có override riêng sẽ lập tức chuyển sang model này ở lượt chat tiếp theo.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAllConfirmModal(false)}
                disabled={isSavingConfig}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="nav-btn primary"
                onClick={handleApplyConfig}
                disabled={isSavingConfig}
                style={{ background: '#d97706', borderColor: '#b45309' }}
              >
                {isSavingConfig ? 'Đang áp dụng...' : 'Xác Nhận Thay Đổi Cho All'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
