import { useEffect, useState } from 'react';
import { createModuleNavigation } from '../utils/moduleNavigation.js';
import { getModule } from '../modules/moduleRegistry.jsx';

export default function useModuleNavigation(fallbackTab) {
  const [navigation] = useState(() => createModuleNavigation(window, fallbackTab, tab => setActiveTab(tab)));
  const [activeTab, setActiveTab] = useState(navigation.initialTab);

  useEffect(() => navigation.start(), [navigation]);
  useEffect(() => {
    document.title = `${getModule(activeTab)?.label ?? 'Tổng quan'} | GHN KAS`;
  }, [activeTab]);

  return [activeTab, navigation.navigate];
}
