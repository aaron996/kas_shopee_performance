import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Report1MienVungHub from './components/Report1MienVungHub';
import Report5LaneCa1 from './components/Report5LaneCa1';
// Lazy: recharts chỉ nằm trong chunk của tab này, không kéo theo khi mở tab 1/2.
const ReportLeadtime = lazy(() => import('./components/ReportLeadtime'));
// Lazy: kéo theo leadtimeCalc (build index cho tab 3) — chỉ cần tải khi mở tab Insight.
const ReportInsight = lazy(() => import('./components/ReportInsight'));
import ExecutiveSummaryModal from './components/ExecutiveSummaryModal';
import DevAdminDashboard from './components/DevAdminDashboard';
import DataSourceManagerModal from './components/DataSourceManagerModal';
import AuthModal, { isAllowedEmail, isDevAdminEmail } from './components/AuthModal';
import ClientSelectModal from './components/ClientSelectModal';
import CommandPalette from './components/CommandPalette';
import { MIEN_REGIONS } from './data/defaultDataset';
import { readDashboardView, saveDashboardView, dataCoverage } from './utils/dashboardState';
import StatusNotice from './components/ui/StatusNotice';
import { syncAllGoogleSheetTabs } from './utils/googleSheetsSync';
import { fetchSupabaseSheetSync } from './utils/supabaseSheetSync';
import { groupDatesByWeek, getHubType, reassignKaRegion } from './utils/dataProcessor';
import { supabase } from './utils/supabaseClient';
import LoadingScreen from './components/LoadingScreen';
import { useToast } from './components/ui/Toast';
import { Layers, ArrowRightLeft, Clock, Activity, Sparkles } from 'lucide-react';

const ACCESS_LOGGED_KEY_PREFIX = 'ghn_access_logged:';
const ACCESS_LOG_RETRY_DELAYS = [0, 1500, 5000];
const accessLogRequests = new Set();

async function recordAccess(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const loggedKey = `${ACCESS_LOGGED_KEY_PREFIX}${normalizedEmail}`;

  if (sessionStorage.getItem(loggedKey) || accessLogRequests.has(normalizedEmail)) {
    return;
  }

  accessLogRequests.add(normalizedEmail);
  let lastError;

  try {
    for (const delay of ACCESS_LOG_RETRY_DELAYS) {
      if (delay) {
        await new Promise(resolve => window.setTimeout(resolve, delay));
      }

      const { error } = await supabase
        .from('access_logs')
        .insert([{ email: normalizedEmail }]);

      if (!error) {
        sessionStorage.setItem(loggedKey, 'true');
        return;
      }

      lastError = error;
    }

    console.error('Failed to record access after retries:', lastError);
  } finally {
    accessLogRequests.delete(normalizedEmail);
  }
}

export default function App() {
  const showToast = useToast();
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ghn_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email && isAllowedEmail(parsed.email)) {
          // isDevAdmin is intentionally NOT trusted from localStorage here —
          // localStorage is fully attacker-controlled (anyone can edit it via
          // DevTools). Force it false on this optimistic first paint; the
          // getSession()/onAuthStateChange effect below re-derives it from
          // the real, server-verified JWT email and is the only place this
          // flag may flip true. Otherwise the Dev Admin nav item would flash
          // visible for anyone who fakes `email: 'vinhlt@ghn.vn'` in storage,
          // even though the underlying data stays protected by Supabase RLS.
          return {
            ...parsed,
            isDevAdmin: false
          };
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  const [initialView] = useState(() => readDashboardView(sessionStorage, window.location.search));
  const [activeTab, setActiveTab] = useState(initialView.tab);

  // --- Embed support (Control Tower "Sức khỏe vận hành" tab) -------------
  // When this app is loaded inside an <iframe>, the host page can pass the
  // initial scope via ?scope=spb|spe on the iframe src. This mirrors the
  // host's own SPB/SPE toggle so the two stay in sync on first load without
  // any code changes on the host side.
  //   e.g. https://kas-shopee-performance.vercel.app/?scope=spe
  // If the host later flips its toggle without reloading the iframe, it can
  // instead postMessage into the iframe (see the `message` listener below)
  // — cheaper than mutating iframe.src and re-triggering a full reload.
  const [clientFilter, setClientFilter] = useState(initialView.client);
  const [expandAllHubs] = useState(false);

  // Ask "SPE or SPB?" once per browser session, right after login. The
  // dashboard itself stays mounted underneath (same pattern as AuthModal)
  // so it's ready to fade in the instant a choice is made.
  // When a valid ?scope= is present (embedded mode), skip this prompt
  // entirely — the host app already made the choice.
  const [hasPickedClient, setHasPickedClient] = useState(() => (
    initialView.hasPickedClient
  ));

  // Let the host page (Control Tower) update the scope live via postMessage
  // instead of reloading the iframe. Expected shape:
  //   iframeEl.contentWindow.postMessage(
  //     { source: 'control-tower', type: 'set-scope', scope: 'SPE' },
  //     'https://kas-shopee-performance.vercel.app'
  //   )
  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.source !== 'control-tower') return;
      if (data.type === 'set-scope') {
        const scope = typeof data.scope === 'string' ? data.scope.trim().toUpperCase() : null;
        if (scope === 'SPB' || scope === 'SPE') {
          setClientFilter(scope);
          setHasPickedClient(true);
          sessionStorage.setItem('ghn_client_choice', 'true');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleClientPick = (key) => {
    setClientFilter(key);
    sessionStorage.setItem('ghn_client_choice', 'true');
    setHasPickedClient(true);
  };
  
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isDataSourceOpen, setIsDataSourceOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Command palette: Cmd/Ctrl+K từ bất kỳ đâu trong app, trừ khi đang gõ vào
  // 1 input/textarea khác (không cướp phím của ô tìm kiếm khác nếu có).
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isCmdK) return;
      e.preventDefault();
      setIsPaletteOpen(prev => !prev);
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Chọn 1 vùng từ command palette: mở Report 1 (grain hub, nơi Vùng thực sự
  // có tác dụng lọc), thu hẹp bộ lọc Vùng về đúng vùng đó, rồi báo Report1 tự
  // mở rộng + cuộn tới đúng section — cùng cơ chế CustomEvent app đã dùng cho
  // nút "Xuất CSV" ở Header, chỉ khác tên sự kiện.
  const handleJumpToRegion = useCallback((region) => {
    setActiveTab('report1');
    setSelectedRegions([region]);
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('jump-to-region', { detail: { region } }));
    });
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('ghn_theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('ghn_theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('ghn_theme', 'light');
    }
  }, [isDarkMode]);

  const normalizeRows = (rows) => {
    if (!rows) return rows;
    return reassignKaRegion(rows);
  };

  const [pickRows, setPickRows] = useState([]);
  const [deliRows, setDeliRows] = useState([]);
  const [ca1Rows, setCa1Rows] = useState([]);
  const [leadtimeRows, setLeadtimeRows] = useState([]);
  const [dataSources, setDataSources] = useState({ pick: 'Chưa tải', deli: 'Chưa tải', ca1: 'Chưa tải' });
  // Sources stay explicit; operational reports start empty, never with mock rows.
  const [leadtimeSource, setLeadtimeSource] = useState('none');
  const [leadtimeSyncedAt, setLeadtimeSyncedAt] = useState(null);

  // Initialize selected regions with all regions
  const allRegions = React.useMemo(() => {
    return Object.values(MIEN_REGIONS).flat();
  }, []);
  const [selectedRegions, setSelectedRegions] = useState(() => initialView.regions === null ? allRegions : initialView.regions.filter(r => allRegions.includes(r)));

  const allHubTypes = React.useMemo(() => {
    const types = new Set();
    [...pickRows, ...deliRows, ...ca1Rows].forEach(r => {
      const type = getHubType(r);
      if (type) {
        types.add(type);
      }
    });
    // Add 'Unknown' if we want it as a fallback, but let's just use what's in data.
    // If we want a default fallback just in case:
    return Array.from(types).sort();
  }, [pickRows, deliRows, ca1Rows]);
  
  // Initial state should be all hub types
  const [hubTypeSelection, setHubTypeSelection] = useState(initialView.hubTypes);
  const selectedHubTypes = hubTypeSelection === null ? allHubTypes : hubTypeSelection;
  const setSelectedHubTypes = values => setHubTypeSelection(values.length === allHubTypes.length && allHubTypes.length > 0 ? null : values);

  // null follows all available types; an explicit subset (including []) survives sync.
  const [density, setDensity] = useState(initialView.density);
  useEffect(() => {
    if (hasPickedClient) saveDashboardView(sessionStorage, { client: clientFilter, tab: activeTab, regions: selectedRegions, hubTypes: hubTypeSelection, density });
  }, [hasPickedClient, clientFilter, activeTab, selectedRegions, hubTypeSelection, density]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'default', source: 'Chưa tải', text: 'Chưa có dữ liệu vận hành' });
  // Giờ đồng bộ THÀNH CÔNG gần nhất — hiển thị ở Header cho MỌI tab (trước đây
  // chỉ tab Leadtime có "syncedAt" riêng). Không dùng cho việc chặn UI: sync
  // chạy nền, số cũ vẫn hiển thị, không còn full-screen overlay mỗi lần mở app.
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const [onlineUsers, setOnlineUsers] = useState([]);

  // Listen for Supabase Authentication State changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        const email = session.user.email.toLowerCase();
        if (isAllowedEmail(email)) {
          const userObj = {
            email,
            name: email.split('@')[0],
            isDevAdmin: isDevAdminEmail(email),
            supabaseUser: session.user
          };
          localStorage.setItem('ghn_user', JSON.stringify(userObj));
          setCurrentUser(userObj);
        } else {
          showToast(`Tài khoản "${email}" không thuộc hệ thống GHN (@ghn.vn) nên không có quyền truy cập ứng dụng này.`, { tone: 'error', title: 'Truy cập bị từ chối', duration: 9000 });
          supabase.auth.signOut();
          localStorage.removeItem('ghn_user');
          setCurrentUser(null);
        }
      } else {
        localStorage.removeItem('ghn_user');
        setCurrentUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        const email = session.user.email.toLowerCase();
        if (isAllowedEmail(email)) {
          const userObj = {
            email,
            name: email.split('@')[0],
            isDevAdmin: isDevAdminEmail(email),
            supabaseUser: session.user
          };
          localStorage.setItem('ghn_user', JSON.stringify(userObj));
          setCurrentUser(userObj);
        } else {
          showToast(`Tài khoản "${email}" không thuộc hệ thống GHN (@ghn.vn) nên không có quyền truy cập ứng dụng này.`, { tone: 'error', title: 'Truy cập bị từ chối', duration: 9000 });
          supabase.auth.signOut();
          localStorage.removeItem('ghn_user');
          setCurrentUser(null);
        }
      } else {
        localStorage.removeItem('ghn_user');
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [showToast]);

  const handleResetDefaultData = () => {
    setPickRows([]);
    setDeliRows([]);
    setCa1Rows([]);
    setLeadtimeRows([]);
    setDataSources({ pick: 'Chưa tải', deli: 'Chưa tải', ca1: 'Chưa tải' });
    setLeadtimeSource('none');
    setLeadtimeSyncedAt(null);
    setLastSyncedAt(null);
    setSyncStatus({ kind: 'default', source: 'Chưa tải', text: 'Đã xóa dữ liệu trên phiên này. Tải lại để lấy dữ liệu vận hành.' });
  };

  const syncRequestRef = React.useRef(false);
  const handleSyncLiveSheet = useCallback(async () => {
    if (syncRequestRef.current) return;
    syncRequestRef.current = true;
    setIsSyncing(true);
    setSyncStatus({ kind: 'loading', source: 'Đang đồng bộ', text: 'Đang tải dữ liệu...' });
    try {

    // Primary path: Apps Script pushes the Sheet's tabs into Supabase on a
    // timer (no longer depends on the Sheet being publicly link-shared —
    // see docs/google-sheet-supabase-sync.md).
    const supaRes = await fetchSupabaseSheetSync();
    if (supaRes.success) {
      setPickRows(normalizeRows(supaRes.pickData));
      setDeliRows(normalizeRows(supaRes.deliData));
      setDataSources(prev => ({ pick: 'Supabase', deli: 'Supabase', ca1: supaRes.ca1Data ? 'Supabase' : `${prev.ca1.replace(' (chưa cập nhật)', '')} (chưa cập nhật)` }));
      if (supaRes.ca1Data) setCa1Rows(normalizeRows(supaRes.ca1Data));
      if (supaRes.leadtimeData) {
        setLeadtimeRows(supaRes.leadtimeData);
        setLeadtimeSource('supabase');
        setLeadtimeSyncedAt(supaRes.updatedAt || null);
      }
      setIsSyncing(false);
      setSyncStatus({ kind: 'live', source: 'Supabase live', text: 'Đã đồng bộ từ Supabase' });
      setLastSyncedAt(new Date());
      return;
    }

    // Fallback: the old direct-CSV approach, kept for sheets that are still
    // publicly link-shared (e.g. a dev/test sheet set via Data Source Manager).
    const res = await syncAllGoogleSheetTabs('1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA');
    setIsSyncing(false);

    if (res.success) {
      setPickRows(normalizeRows(res.pickData));
      setDeliRows(normalizeRows(res.deliData));
      setDataSources(prev => ({ pick: 'Google Sheet', deli: 'Google Sheet', ca1: res.ca1Data ? 'Google Sheet' : `${prev.ca1.replace(' (chưa cập nhật)', '')} (chưa cập nhật)` }));
      if (res.ca1Data) setCa1Rows(normalizeRows(res.ca1Data));
      setSyncStatus({ kind: 'live', source: 'Google Sheet', text: 'Đã đồng bộ từ Google Sheet' });
      setLastSyncedAt(new Date());
    } else {
      if (res.error === 'FILE_PRIVATE') {
        if (currentUser && currentUser.isDevAdmin) {
          showToast('Chưa có dữ liệu Supabase (chưa chạy Apps Script sync) và Google Sheet cũng không còn public. Xem docs/google-sheet-supabase-sync.md để cài Apps Script, hoặc dùng "Quản Lý Nguồn Dữ Liệu" để upload CSV thủ công.', { tone: 'warning', title: 'Chưa có dữ liệu live', duration: 9000 });
          setIsDataSourceOpen(true);
        } else {
          showToast('Chưa có dữ liệu live. Vui lòng báo Dev Admin để cài đồng bộ dữ liệu.', { tone: 'warning', duration: 7000 });
        }
      } else {
        // Report the failed fetch without assuming the cause or prior live data.
        const isTimeout = /timeout/i.test(supaRes.error || '') || /timeout/i.test(res.error || '');
        showToast(
          isTimeout
            ? 'Nguồn dữ liệu phản hồi quá chậm. Chưa lấy được dữ liệu mới; kiểm tra nguồn và thử lại.'
            : 'Không đồng bộ được dữ liệu mới từ nguồn (Supabase/Google Sheet). Vui lòng thử lại.',
          { tone: 'warning', title: 'Nguồn dữ liệu đang gặp sự cố', duration: 9000 }
        );
      }
      console.error('Live data sync failed:', { supabase: supaRes.error, googleSheet: res.error });
      setSyncStatus({ kind: 'error', source: 'Đồng bộ lỗi', text: 'Không tải được dữ liệu mới. Nếu có số liệu bên dưới, đó là bản đã tải trước đó trong phiên này.' });
    }
    } catch (error) {
      console.error('Unexpected data sync failure:', error);
      setSyncStatus({ kind: 'error', source: 'Đồng bộ lỗi', text: 'Không tải được dữ liệu mới. Dữ liệu đã tải trong phiên này được giữ nguyên; vui lòng thử lại.' });
    } finally {
      syncRequestRef.current = false;
      setIsSyncing(false);
    }
  }, [currentUser, showToast]);

  const [hasFetchedLive, setHasFetchedLive] = useState(false);

  // Auto-sync live data on page mount if authenticated
  useEffect(() => {
    if (currentUser?.email && !hasFetchedLive && !isSyncing) {
      handleSyncLiveSheet();
      setHasFetchedLive(true);
    }
  }, [currentUser?.email, handleSyncLiveSheet, hasFetchedLive, isSyncing]);

  // Real-time Presence & Access Logging
  useEffect(() => {
    if (!currentUser) return;

    recordAccess(currentUser.email);

    const room = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUser.email,
        },
      },
    });

    room.on('presence', { event: 'sync' }, () => {
      const state = room.presenceState();
      const users = [];
      Object.keys(state).forEach((key) => {
        state[key].forEach((pres) => {
          users.push(pres);
        });
      });
      const uniqueUsers = Array.from(new Map(users.map(u => [u.email, u])).values());
      setOnlineUsers(uniqueUsers);
    });

    room.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await room.track({
          email: currentUser.email,
          name: currentUser.name,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(room);
    };
  }, [currentUser]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('ghn_user');
    setCurrentUser(null);
  };

  // Filter datasets based on selectedRegions and selectedHubTypes
  const filteredPickRows = React.useMemo(() => {
    return pickRows.filter(r => selectedRegions.includes(r.region) && selectedHubTypes.includes(getHubType(r)));
  }, [pickRows, selectedRegions, selectedHubTypes]);

  const filteredDeliRows = React.useMemo(() => {
    return deliRows.filter(r => selectedRegions.includes(r.region) && selectedHubTypes.includes(getHubType(r)));
  }, [deliRows, selectedRegions, selectedHubTypes]);

  const filteredCa1Rows = React.useMemo(() => {
    return ca1Rows.filter(r => selectedRegions.includes(r.vung_giao) && selectedHubTypes.includes(getHubType(r)));
  }, [ca1Rows, selectedRegions, selectedHubTypes]);

  const scopedPick = filteredPickRows.filter(r => clientFilter === 'ALL' || r.client_name === clientFilter);
  const scopedDeli = filteredDeliRows.filter(r => clientFilter === 'ALL' || r.client_name === clientFilter);
  const headerRows = activeTab === 'report5' ? filteredCa1Rows : activeTab === 'report3' ? leadtimeRows : activeTab === 'report-insight' ? [...pickRows, ...deliRows].filter(r => clientFilter === 'ALL' || r.client_name === clientFilter) : [...scopedPick, ...scopedDeli];
  const allDates = [...new Set(headerRows.map(r => activeTab === 'report5' ? r.ngay : r.report_date))].filter(Boolean).sort();
  const { d1Date } = groupDatesByWeek(allDates);
  const d1DateFormatted = d1Date ? `${d1Date.slice(8, 10)}/${d1Date.slice(5, 7)}/${d1Date.slice(0, 4)}` : '';
  const canExport = activeTab === 'report1' ? scopedPick.length + scopedDeli.length > 0 : activeTab === 'report5' && filteredCa1Rows.length > 0;
  const exportContext = {
    'Phạm vi Client': activeTab === 'report5' ? 'Không phân tách Client (nguồn Ca 1)' : clientFilter,
    'Vùng đã chọn': selectedRegions.join(' | ') || 'Không chọn vùng',
    'Loại Hub đã chọn': selectedHubTypes.join(' | ') || 'Không chọn loại Hub',
    'Nguồn': activeTab === 'report5' ? dataSources.ca1 : `Pickup: ${dataSources.pick}; Deli: ${dataSources.deli}`,
    'Khoảng dữ liệu': activeTab === 'report5' ? dataCoverage(filteredCa1Rows, 'ngay') : dataCoverage([...scopedPick, ...scopedDeli]),
  };
  const resetFilters = () => { setSelectedRegions(allRegions); setHubTypeSelection(null); };

  return (
    <div className="app-container">
      {/* Authentication Protection Modal */}
      <AuthModal
        isOpen={!currentUser}
      />

      {/* First-run "Which client?" prompt — shown right after login, once
          per browser session, before the dashboard is usable. */}
      <ClientSelectModal
        isOpen={!!currentUser && !hasPickedClient}
        onSelect={handleClientPick}
      />

      {/* Background refresh preserves only data actually loaded in this session. */}
      {isSyncing && <div className="sync-progress-bar" aria-hidden="true" />}

      {/* Command palette — Cmd/Ctrl+K từ bất kỳ đâu */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        onSelectRegion={handleJumpToRegion}
        hasInsightTab
      />

      {/* Main Layout wrapper for Sidebar + Content */}
      <div className="app-layout">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Main Content Area (Header + Dashboard) */}
        <div className="app-main">
          {/* Header Navigation & Filter Bar */}
          <Header
            setActiveTab={setActiveTab}
            activeTab={activeTab}
            clientFilter={clientFilter}
            setClientFilter={setClientFilter}
            selectedRegions={selectedRegions}
            setSelectedRegions={setSelectedRegions}
            allHubTypes={allHubTypes}
            selectedHubTypes={selectedHubTypes}
            setSelectedHubTypes={setSelectedHubTypes}
            d1DateFormatted={d1DateFormatted}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            onOpenSummary={() => setIsSummaryOpen(true)}
            onOpenPalette={() => setIsPaletteOpen(true)}
            currentUser={currentUser}
            onLogout={handleLogout}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            density={density}
            setDensity={setDensity}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            onRetryData={handleSyncLiveSheet}
            canExport={canExport}
            exportContext={exportContext}
            onResetFilters={resetFilters}
          />

          {/* Main View Area (Principle 6: Slow In & Slow Out / Tab View Transitions) */}
          <main className="main-content">
            {activeTab !== 'dev-admin' && (activeTab !== 'report3' || syncStatus.kind === 'error') && <div className="report-data-context">
              <StatusNotice tone={syncStatus.kind === 'error' ? 'warning' : 'info'}>
                {syncStatus.kind === 'error' && <div>{syncStatus.text} <button type="button" className="nav-btn-sleek" onClick={handleSyncLiveSheet}>Thử lại</button></div>}
                {activeTab === 'report5' ? <div>Ca 1 không phân tách Client trong nguồn hiện tại; bộ lọc SPB/SPE không áp dụng. Nguồn: {dataSources.ca1} · {dataCoverage(filteredCa1Rows, 'ngay')}</div> : activeTab !== 'report3' && <>
                  <div>Pickup · {dataSources.pick} · {dataCoverage(activeTab === 'report-insight' ? pickRows.filter(r => clientFilter === 'ALL' || r.client_name === clientFilter) : scopedPick)}</div>
                  <div>Deli · {dataSources.deli} · {dataCoverage(activeTab === 'report-insight' ? deliRows.filter(r => clientFilter === 'ALL' || r.client_name === clientFilter) : scopedDeli)}</div>
                  {activeTab === 'report-insight' && <div>Leadtime · {leadtimeSource === 'none' ? 'Chưa tải' : leadtimeSource} · {leadtimeRows.length} dòng dữ liệu</div>}
                </>}
                {(activeTab === 'report1' || activeTab === 'report5') && <div>{clientFilter !== 'ALL' && activeTab === 'report1' ? `${clientFilter} · ` : ''}{selectedRegions.length}/{allRegions.length} vùng · {selectedHubTypes.length}/{allHubTypes.length} loại Hub <button type="button" className="nav-btn-sleek" onClick={resetFilters}>Đặt lại bộ lọc</button></div>}
              </StatusNotice>
            </div>}
            <div key={activeTab} className="tab-view-content">
              {activeTab === 'report1' && (
                <Report1MienVungHub
                  pickRows={filteredPickRows}
                  deliRows={filteredDeliRows}
                  clientFilter={clientFilter}
                  expandAllHubs={expandAllHubs}
                  selectedRegions={selectedRegions}
                  density={density}
                  isFullscreen={isFullscreen}
                  setIsFullscreen={setIsFullscreen}
                  onResetFilters={resetFilters}
                />
              )}

              {activeTab === 'report5' && (
                <Report5LaneCa1
                  ca1Rows={filteredCa1Rows}
                  density={density}
                  isFullscreen={isFullscreen}
                  setIsFullscreen={setIsFullscreen}
                />
              )}

              {activeTab === 'report3' && (
                <Suspense fallback={<LoadingScreen text="Đang mở tab Leadtime..." option={4} />}>
                  <ReportLeadtime
                    leadtimeRows={leadtimeRows}
                    clientFilter={clientFilter}
                    density={density}
                    dataSource={leadtimeSource}
                    syncedAt={leadtimeSyncedAt}
                  />
                </Suspense>
              )}

              {activeTab === 'report-insight' && (
                <Suspense fallback={<LoadingScreen text="Đang mở tab Insight..." option={4} />}>
                  <ReportInsight
                    pickRows={pickRows}
                    deliRows={deliRows}
                    leadtimeRows={leadtimeRows}
                    clientFilter={clientFilter}
                    onJumpToRegion={handleJumpToRegion}
                  />
                </Suspense>
              )}

              {activeTab === 'dev-admin' && currentUser?.isDevAdmin && (
                <DevAdminDashboard onlineUsers={onlineUsers} />
              )}
            </div>
          </main>

          {/* Mobile Bottom Navigation Bar */}
          <nav className="mobile-bottom-nav">
            <button 
              className={`mobile-nav-item ${activeTab === 'report1' ? 'active' : ''}`}
              aria-current={activeTab === 'report1' ? 'page' : undefined}
              onClick={() => setActiveTab('report1')}
            >
              <Layers size={18} />
              <span>1. 4 Chỉ Số</span>
            </button>

            <button 
              className={`mobile-nav-item ${activeTab === 'report5' ? 'active' : ''}`}
              aria-current={activeTab === 'report5' ? 'page' : undefined}
              onClick={() => setActiveTab('report5')}
            >
              <ArrowRightLeft size={18} />
              <span>2. % Ca 1</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'report3' ? 'active' : ''}`}
              aria-current={activeTab === 'report3' ? 'page' : undefined}
              onClick={() => setActiveTab('report3')}
            >
              <Clock size={18} />
              <span>3. Leadtime</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'report-insight' ? 'active' : ''}`}
              aria-current={activeTab === 'report-insight' ? 'page' : undefined}
              onClick={() => setActiveTab('report-insight')}
            >
              <Sparkles size={18} />
              <span>4. Insight</span>
            </button>

            <button
              className="mobile-nav-item"
              onClick={() => setIsSummaryOpen(true)}
            >
              <Activity size={18} />
              <span>Tóm tắt</span>
            </button>
          </nav>

          {/* Executive D-1 vs D-8 Summary Modal */}
          <ExecutiveSummaryModal
            isOpen={isSummaryOpen}
            onClose={() => setIsSummaryOpen(false)}
            pickRows={filteredPickRows}
            deliRows={filteredDeliRows}
            clientFilter={clientFilter}
          />

          {/* Sheet Data Source Manager Modal (Only visible for dev admin) */}
          {currentUser && currentUser.isDevAdmin && (
            <DataSourceManagerModal
              isOpen={isDataSourceOpen}
              onClose={() => setIsDataSourceOpen(false)}
              onUpdatePickData={(rows, source = 'CSV tải lên') => { setPickRows(normalizeRows(rows)); setDataSources(prev => ({ ...prev, pick: source })); }}
              onUpdateDeliData={(rows, source = 'CSV tải lên') => { setDeliRows(normalizeRows(rows)); setDataSources(prev => ({ ...prev, deli: source })); }}
              onUpdateCa1Data={(rows, source = 'CSV tải lên') => { setCa1Rows(normalizeRows(rows)); setDataSources(prev => ({ ...prev, ca1: source })); }}
              onUpdateLeadtimeData={(rows, source = 'csv') => { setLeadtimeRows(rows); setLeadtimeSource(source); setLeadtimeSyncedAt(source === 'supabase' ? rows[0]?.synced_at : null); }}
              onResetDefault={handleResetDefaultData}
            />
          )}
        </div>
      </div>
    </div>
  );
}
