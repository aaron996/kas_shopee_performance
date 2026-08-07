import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Report1MienVungHub from './components/Report1MienVungHub';
import Report5LaneCa1 from './components/Report5LaneCa1';
import ExecutiveSummaryModal from './components/ExecutiveSummaryModal';
import DataSourceManagerModal from './components/DataSourceManagerModal';
import { createDefaultPickDataset, createDefaultDeliDataset } from './data/defaultDataset';
import { syncAllGoogleSheetTabs } from './utils/googleSheetsSync';

export default function App() {
  const [activeTab, setActiveTab] = useState('report1');
  const [clientFilter, setClientFilter] = useState('SPB');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isDataSourceOpen, setIsDataSourceOpen] = useState(false);

  const [pickRows, setPickRows] = useState(() => createDefaultPickDataset());
  const [deliRows, setDeliRows] = useState(() => createDefaultDeliDataset());

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isLive: false, text: 'Đang kết nối Sheet...' });

  const handleResetDefaultData = () => {
    setPickRows(createDefaultPickDataset());
    setDeliRows(createDefaultDeliDataset());
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
      setSyncStatus({ isLive: true, text: 'Live Sheet Auto-Synced' });
    } else {
      if (res.error === 'FILE_PRIVATE') {
        alert('⚠️ Google Sheet hiện tại đang ở chế độ Riêng tư (Private).\n\nHãy đổi quyền truy cập trong Google Sheet sang "Anyone with link can view" (Bất kỳ ai có liên kết đều có thể xem) để web app tự động đọc live!');
        setIsDataSourceOpen(true);
      } else {
        alert(`Lỗi kết nối Google Sheet: ${res.error}`);
      }
      setSyncStatus({ isLive: false, text: 'Sync Failed' });
    }
  };

  // Auto-sync live data on page mount
  useEffect(() => {
    handleSyncLiveSheet();
  }, []);

  return (
    <div className="app-container">
      {/* Header Navigation & Filter Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenSummary={() => setIsSummaryOpen(true)}
        onOpenDataSource={() => setIsDataSourceOpen(true)}
        onResetData={handleResetDefaultData}
        onSyncLiveSheet={handleSyncLiveSheet}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
      />

      {/* Main View Area */}
      <main className="main-content">
        {activeTab === 'report1' && (
          <Report1MienVungHub
            pickRows={pickRows}
            deliRows={deliRows}
            clientFilter={clientFilter}
            searchTerm={searchTerm}
          />
        )}

        {activeTab === 'report5' && (
          <Report5LaneCa1
            searchTerm={searchTerm}
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

      {/* Sheet Data Source Manager Modal */}
      <DataSourceManagerModal
        isOpen={isDataSourceOpen}
        onClose={() => setIsDataSourceOpen(false)}
        onUpdatePickData={(rows) => setPickRows(rows)}
        onUpdateDeliData={(rows) => setDeliRows(rows)}
        onResetDefault={handleResetDefaultData}
      />
    </div>
  );
}
