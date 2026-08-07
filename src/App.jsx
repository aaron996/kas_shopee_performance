import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Report1MienVungHub from './components/Report1MienVungHub';
import Report5LaneCa1 from './components/Report5LaneCa1';
import ExecutiveSummaryModal from './components/ExecutiveSummaryModal';
import DataSourceManagerModal from './components/DataSourceManagerModal';
import AuthModal, { isAllowedEmail, isDevAdminEmail } from './components/AuthModal';
import { createDefaultPickDataset, createDefaultDeliDataset, createDefaultCa1Dataset } from './data/defaultDataset';
import { syncAllGoogleSheetTabs } from './utils/googleSheetsSync';
import { groupDatesByWeek } from './utils/dataProcessor';
import { supabase } from './utils/supabaseClient';

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

  const [pickRows, setPickRows] = useState(() => createDefaultPickDataset());
  const [deliRows, setDeliRows] = useState(() => createDefaultDeliDataset());
  const [ca1Rows, setCa1Rows] = useState(() => createDefaultCa1Dataset());

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isLive: false, text: 'Đang kết nối Sheet...' });

  // Listen for Supabase Authentication State changes
  useEffect(() => {
    // Check initial session
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
    setPickRows(createDefaultPickDataset());
    setDeliRows(createDefaultDeliDataset());
    setCa1Rows(createDefaultCa1Dataset());
    setSyncStatus({ isLive: false, text: 'Default Dataset' });
  };

  const handleSyncLiveSheet = async () => {
    setIsSyncing(true);
    setSyncStatus({ isLive: false, text: 'Đang tải Sheet...' });

    const res = await syncAllGoogleSheetTabs('1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA');
    setIsSyncing(false);

    if (res.success) {
      setPickRows(res.pickData);
      setDeliRows(res.deliData);
      if (res.ca1Data) setCa1Rows(res.ca1Data);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('ghn_user');
    setCurrentUser(null);
  };

  // Extract dynamic date info for the Header
  const allDates = [...new Set(pickRows.map(r => r.report_date))].filter(Boolean).sort();
  const { d1Date, weekCurrent } = groupDatesByWeek(allDates);
  // Get week number from the first day of current week
  const getWeekNumber = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
    return Math.ceil((d.getDay() + 1 + days) / 7);
  };
  const weekNum = weekCurrent?.[0] ? getWeekNumber(weekCurrent[0]) : '';
  const d1DateFormatted = d1Date ? `${d1Date.slice(8, 10)}/${d1Date.slice(5, 7)}/${d1Date.slice(0, 4)}` : '';

  return (
    <div className="app-container">
      {/* Authentication Protection Modal */}
      <AuthModal
        isOpen={!currentUser}
        onLoginSuccess={(user) => setCurrentUser(user)}
      />

      {/* Header Navigation & Filter Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        expandAllHubs={expandAllHubs}
        setExpandAllHubs={setExpandAllHubs}
        d1DateFormatted={d1DateFormatted}
        weekNum={weekNum}
        onOpenSummary={() => setIsSummaryOpen(true)}
        onOpenDataSource={() => setIsDataSourceOpen(true)}
        onResetData={handleResetDefaultData}
        onSyncLiveSheet={handleSyncLiveSheet}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main View Area */}
      <main className="main-content">
        {activeTab === 'report1' && (
          <Report1MienVungHub
            pickRows={pickRows}
            deliRows={deliRows}
            clientFilter={clientFilter}
            expandAllHubs={expandAllHubs}
          />
        )}

        {activeTab === 'report5' && (
          <Report5LaneCa1
            ca1Rows={ca1Rows}
          />
        )}
      </main>

      {/* Executive D-1 vs D-8 Summary Modal */}
      <ExecutiveSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        pickRows={pickRows}
        deliRows={deliRows}
        clientFilter={clientFilter}
      />

      {/* Sheet Data Source Manager Modal (Only visible for dev admin) */}
      {currentUser && currentUser.isDevAdmin && (
        <DataSourceManagerModal
          isOpen={isDataSourceOpen}
          onClose={() => setIsDataSourceOpen(false)}
          onUpdatePickData={(rows) => setPickRows(rows)}
          onUpdateDeliData={(rows) => setDeliRows(rows)}
          onResetDefault={handleResetDefaultData}
        />
      )}
    </div>
  );
}
