import React, { useState } from 'react';
import Header from './components/Header';
import Report1MienVungHub from './components/Report1MienVungHub';
import Report5LaneCa1 from './components/Report5LaneCa1';
import ExecutiveSummaryModal from './components/ExecutiveSummaryModal';
import DataSourceManagerModal from './components/DataSourceManagerModal';
import { createDefaultPickDataset, createDefaultDeliDataset } from './data/defaultDataset';

export default function App() {
  const [activeTab, setActiveTab] = useState('report1');
  const [clientFilter, setClientFilter] = useState('SPB');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isDataSourceOpen, setIsDataSourceOpen] = useState(false);

  const [pickRows, setPickRows] = useState(() => createDefaultPickDataset());
  const [deliRows, setDeliRows] = useState(() => createDefaultDeliDataset());

  const handleResetDefaultData = () => {
    setPickRows(createDefaultPickDataset());
    setDeliRows(createDefaultDeliDataset());
  };

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
