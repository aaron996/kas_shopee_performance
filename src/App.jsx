import React, { useState, useEffect } from 'react';
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
import { groupDatesByWeek, getHubType } from './utils/dataProcessor';
import { supabase } from './utils/supabaseClient';
import { Layers, ArrowRightLeft, Activity } from 'lucide-react';

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
  const [expandAllHubs, setExpandAllHubs] = useState(false);
  
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
    return rows.filter(r => {
      const type = getHubType(r);
      return type.toLowerCase() !== 'ahamove';
    });
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

  // Re-sync selectedHubTypes if allHubTypes changes (e.g., switching from mock to live data)
  useEffect(() => {
    if (allHubTypes.length > 0) {
      const hasOverlap = selectedHubTypes.some(t => allHubTypes.includes(t));
      if (!hasOverlap) {
        setSelectedHubTypes(allHubTypes);
      }
    }
  }, [allHubTypes]);

  const [density, setDensity] = useState('comfortable');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isLive: false, text: 'Đang kết nối Sheet...' });

  const [isDevAdminDashboardOpen, setIsDevAdminDashboardOpen] = useState(false);
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
    setSyncStatus({ isLive: false, text: 'Default Dataset' });
  };

  const handleSyncLiveSheet = async () => {
    setIsSyncing(true);
    setSyncStatus({ isLive: false, text: 'Đang tải Sheet...' });

    const res = await syncAllGoogleSheetTabs('1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA');
    setIsSyncing(false);

    if (res.success) {
      setPickRows(filterAhamove(res.pickData));
      setDeliRows(filterAhamove(res.deliData));
      if (res.ca1Data) setCa1Rows(filterAhamove(res.ca1Data));
      setSyncStatus({ isLive: true, text: 'Live Sheet Auto-Synced' });
    } else {
      if (res.error === 'FILE_PRIVATE') {
        alert('⚠️ Google Sheet hiện tại đang ở chế độ Riêng tư (Private).\n\nHãy đổi quyền truy cập trong Google Sheet sang "Anyone with link can view" (Bất kỳ ai có liên kết đều có thể xem) để web app tự động đọc live!');
        if (currentUser && currentUser.isDevAdmin) {
          setIsDataSourceOpen(true);
        }
      } else {
        alert(`Lỗi kết nối Google Sheet: ${res.error}`);
      }
      setSyncStatus({ isLive: false, text: 'Sync Failed' });
    }
  };

  // Auto-sync live data on page mount if authenticated
  useEffect(() => {
    if (currentUser) {
      handleSyncLiveSheet();
    }
  }, [currentUser]);

  // Real-time Presence & Access Logging
  useEffect(() => {
    if (!currentUser) return;

    // 1. Log access to access_logs table
    const logAccess = async () => {
      try {
        await supabase.from('access_logs').insert([{ email: currentUser.email }]);
      } catch (err) {
        console.error('Failed to log access:', err);
      }
    };
    
    // Only log once per session to avoid spam
    if (!sessionStorage.getItem('ghn_access_logged')) {
      logAccess();
      sessionStorage.setItem('ghn_access_logged', 'true');
    }

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
  const { d1Date, weekCurrent } = groupDatesByWeek(allDates);
  const getWeekNumber = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
    return Math.ceil((d.getDay() + 1 + days) / 7);
  };
  const weekNum = weekCurrent?.[0] ? getWeekNumber(weekCurrent[0]) : '';
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
        onLoginSuccess={(user) => setCurrentUser(user)}
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
          onOpenDevAdmin={() => setIsDevAdminDashboardOpen(true)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Main Content Area (Header + Dashboard) */}
        <div className="app-main">
          {/* Header Navigation & Filter Bar */}
          <Header
            activeTab={activeTab}
        setActiveTab={setActiveTab}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        selectedRegions={selectedRegions}
        setSelectedRegions={setSelectedRegions}
        allHubTypes={allHubTypes}
        selectedHubTypes={selectedHubTypes}
        setSelectedHubTypes={setSelectedHubTypes}
        expandAllHubs={expandAllHubs}
        setExpandAllHubs={setExpandAllHubs}
        d1DateFormatted={d1DateFormatted}
        weekNum={weekNum}
        onOpenSummary={() => setIsSummaryOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenDevAdmin={() => setIsDevAdminDashboardOpen(true)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
            density={density}
            setDensity={setDensity}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
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
            selectedRegions={selectedRegions}
            density={density}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
          />
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

          {isDevAdminDashboardOpen && currentUser?.isDevAdmin && (
            <DevAdminDashboard 
              isOpen={isDevAdminDashboardOpen} 
              onClose={() => setIsDevAdminDashboardOpen(false)} 
              onlineUsers={onlineUsers} 
            />
          )}
        </div>
      </div>
    </div>
  );
}

