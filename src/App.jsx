import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Report1MienVungHub from './components/Report1MienVungHub';
import Report5LaneCa1 from './components/Report5LaneCa1';
import ExecutiveSummaryModal from './components/ExecutiveSummaryModal';
import DevAdminDashboard from './components/DevAdminDashboard';
import DataSourceManagerModal from './components/DataSourceManagerModal';
import AuthModal, { isAllowedEmail, isDevAdminEmail } from './components/AuthModal';
import { createDefaultPickDataset, createDefaultDeliDataset, createDefaultCa1Dataset, MIEN_REGIONS } from './data/defaultDataset';
import { syncAllGoogleSheetTabs } from './utils/googleSheetsSync';
import { fetchSupabaseSheetSync } from './utils/supabaseSheetSync';
import { groupDatesByWeek, getHubType, reassignKaRegion } from './utils/dataProcessor';
import { supabase } from './utils/supabaseClient';
import LoadingScreen from './components/LoadingScreen';
import { Layers, ArrowRightLeft, Activity } from 'lucide-react';

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
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ghn_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email && isAllowedEmail(parsed.email)) {
          return {
            ...parsed,
            isDevAdmin: isDevAdminEmail(parsed.email)
          };
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState('report1');
  const [clientFilter, setClientFilter] = useState('SPB');
  const [expandAllHubs] = useState(false);
  
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isDataSourceOpen, setIsDataSourceOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const filterAhamove = (rows) => {
    if (!rows) return rows;
    const filtered = rows.filter(r => {
      const type = getHubType(r);
      return type.toLowerCase() !== 'ahamove';
    });
    return reassignKaRegion(filtered);
  };

  const [pickRows, setPickRows] = useState(() => filterAhamove(createDefaultPickDataset()));
  const [deliRows, setDeliRows] = useState(() => filterAhamove(createDefaultDeliDataset()));
  const [ca1Rows, setCa1Rows] = useState(() => filterAhamove(createDefaultCa1Dataset()));

  // Initialize selected regions with all regions
  const allRegions = React.useMemo(() => {
    return Object.values(MIEN_REGIONS).flat();
  }, []);
  const [selectedRegions, setSelectedRegions] = useState(allRegions);

  const allHubTypes = React.useMemo(() => {
    const types = new Set();
    pickRows.forEach(r => {
      const type = getHubType(r);
      if (type && type !== 'Unknown' && type.toLowerCase() !== 'ahamove') {
        types.add(type);
      }
    });
    // Add 'Unknown' if we want it as a fallback, but let's just use what's in data.
    // If we want a default fallback just in case:
    if (types.size === 0) {
      types.add('Mega Hub');
      types.add('Hub LM');
    }
    return Array.from(types).sort();
  }, [pickRows]);
  
  // Initial state should be all hub types
  const [selectedHubTypes, setSelectedHubTypes] = useState(allHubTypes);

  // Re-sync selectedHubTypes whenever the set of available hub types actually
  // changes (e.g., switching from mock to live data). We track the last seen
  // set of types (not the current selection) — checking for *any* overlap
  // with the current selection was too weak: if, say, only "KA" happened to
  // exist in both the mock fixture and the live data, every other live hub
  // type would silently stay excluded from the filter forever, making the
  // dashboard look like it defaults to "only KA".
  const lastHubTypesKeyRef = React.useRef(null);
  useEffect(() => {
    if (allHubTypes.length === 0) return;
    const key = allHubTypes.join('|');
    if (lastHubTypesKeyRef.current !== key) {
      lastHubTypesKeyRef.current = key;
      setSelectedHubTypes(allHubTypes);
    }
  }, [allHubTypes]);

  const [density, setDensity] = useState('comfortable');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'default', source: 'Dữ liệu mẫu', text: 'Đang hiển thị dữ liệu mẫu' });

  const [onlineUsers, setOnlineUsers] = useState([]);

  // Listen for Supabase Authentication State changes
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
          alert(`⚠️ Truy cập bị từ chối:\n\nTài khoản "${email}" không thuộc hệ thống GHN (@ghn.vn) nên không có quyền truy cập ứng dụng này.`);
          supabase.auth.signOut();
          localStorage.removeItem('ghn_user');
          setCurrentUser(null);
        }
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
          alert(`⚠️ Truy cập bị từ chối:\n\nTài khoản "${email}" không thuộc hệ thống GHN (@ghn.vn) nên không có quyền truy cập ứng dụng này.`);
          supabase.auth.signOut();
          localStorage.removeItem('ghn_user');
          setCurrentUser(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetDefaultData = () => {
    setPickRows(filterAhamove(createDefaultPickDataset()));
    setDeliRows(filterAhamove(createDefaultDeliDataset()));
    setCa1Rows(filterAhamove(createDefaultCa1Dataset()));
    setSyncStatus({ kind: 'default', source: 'Dữ liệu mẫu', text: 'Đã khôi phục dữ liệu mẫu' });
  };

  const handleSyncLiveSheet = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatus({ kind: 'loading', source: 'Đang đồng bộ', text: 'Đang tải dữ liệu...' });

    // Primary path: Apps Script pushes the Sheet's tabs into Supabase on a
    // timer (no longer depends on the Sheet being publicly link-shared —
    // see docs/google-sheet-supabase-sync.md).
    const supaRes = await fetchSupabaseSheetSync();
    if (supaRes.success) {
      setPickRows(filterAhamove(supaRes.pickData));
      setDeliRows(filterAhamove(supaRes.deliData));
      if (supaRes.ca1Data) setCa1Rows(filterAhamove(supaRes.ca1Data));
      setIsSyncing(false);
      setSyncStatus({ kind: 'live', source: 'Supabase live', text: 'Đã đồng bộ từ Supabase' });
      return;
    }

    // Fallback: the old direct-CSV approach, kept for sheets that are still
    // publicly link-shared (e.g. a dev/test sheet set via Data Source Manager).
    const res = await syncAllGoogleSheetTabs('1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA');
    setIsSyncing(false);

    if (res.success) {
      setPickRows(filterAhamove(res.pickData));
      setDeliRows(filterAhamove(res.deliData));
      if (res.ca1Data) setCa1Rows(filterAhamove(res.ca1Data));
      setSyncStatus({ kind: 'live', source: 'Google Sheet', text: 'Đã đồng bộ từ Google Sheet' });
    } else {
      if (res.error === 'FILE_PRIVATE') {
        if (currentUser && currentUser.isDevAdmin) {
          alert('⚠️ Chưa có dữ liệu Supabase (chưa chạy Apps Script sync) và Google Sheet cũng không còn public.\n\nXem docs/google-sheet-supabase-sync.md để cài Apps Script, hoặc dùng "Quản Lý Nguồn Dữ Liệu" để upload CSV thủ công.');
          setIsDataSourceOpen(true);
        } else {
          alert('⚠️ Chưa có dữ liệu live. Vui lòng báo Dev Admin để cài đồng bộ dữ liệu.');
        }
      }
      console.error('Live data sync failed:', { supabase: supaRes.error, googleSheet: res.error });
      setSyncStatus({ kind: 'error', source: 'Đồng bộ lỗi', text: 'Đang hiển thị dữ liệu gần nhất' });
    }
  }, [currentUser]);

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

    // 1. Log access once per user/session. The session flag is written only
    // after Supabase confirms the insert, so a temporary network/RLS failure
    // is retried instead of silently excluding that user from history.
    recordAccess(currentUser.email);

    // 2. Setup Realtime Presence
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
      // Deduplicate by email
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

  // Extract dynamic date info for the Header
  const allDates = [...new Set(pickRows.map(r => r.report_date))].filter(Boolean).sort();
  const { d1Date } = groupDatesByWeek(allDates);
  const d1DateFormatted = d1Date ? `${d1Date.slice(8, 10)}/${d1Date.slice(5, 7)}/${d1Date.slice(0, 4)}` : '';

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

  return (
    <div className="app-container">
      {/* Authentication Protection Modal */}
      <AuthModal
        isOpen={!currentUser}
      />

      {/* Full-screen Loading Overlay for Initial Fetch/Sync */}
      {isSyncing && (
        <LoadingScreen text={syncStatus.text} option={4} />
      )}

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
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        selectedRegions={selectedRegions}
        setSelectedRegions={setSelectedRegions}
        allHubTypes={allHubTypes}
        selectedHubTypes={selectedHubTypes}
        setSelectedHubTypes={setSelectedHubTypes}
        d1DateFormatted={d1DateFormatted}
        syncStatus={syncStatus}
        onOpenSummary={() => setIsSummaryOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
            density={density}
            setDensity={setDensity}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            onRetryData={handleSyncLiveSheet}
          />

          {/* Main View Area */}
          <main className="main-content">
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

        {activeTab === 'dev-admin' && currentUser?.isDevAdmin && (
          <DevAdminDashboard onlineUsers={onlineUsers} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        <button 
          className={`mobile-nav-item ${activeTab === 'report1' ? 'active' : ''}`}
          onClick={() => setActiveTab('report1')}
        >
          <Layers size={18} />
          <span>1. 4 Chỉ Số</span>
        </button>

        <button 
          className={`mobile-nav-item ${activeTab === 'report5' ? 'active' : ''}`}
          onClick={() => setActiveTab('report5')}
        >
          <ArrowRightLeft size={18} />
          <span>2. % Ca 1</span>
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
          onUpdatePickData={(rows) => setPickRows(filterAhamove(rows))}
          onUpdateDeliData={(rows) => setDeliRows(filterAhamove(rows))}
          onUpdateCa1Data={(rows) => setCa1Rows(filterAhamove(rows))}
          onResetDefault={handleResetDefaultData}
        />
      )}

        </div>
      </div>
    </div>
  );
}

