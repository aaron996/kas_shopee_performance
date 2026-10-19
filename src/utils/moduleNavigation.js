// Keep URL identity independent of React and module chunk loading.
export const MODULE_PATHS = Object.freeze({
  home: '/overview',
  report1: '/performance',
  report5: '/lane-ca1',
  report3: '/leadtime',
  'report-insight': '/insight',
  'cod-suspicion': '/cod-suspicion',
  ranking: '/ranking',
  'dev-admin': '/dev-admin',
});

export function moduleFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return Object.keys(MODULE_PATHS).find(id => MODULE_PATHS[id] === path) ?? null;
}

export function createModuleNavigation(browser, fallbackTab, onChange) {
  const initialTab = moduleFromPath(browser.location.pathname)
    ?? (browser.location.pathname === '/' && Object.hasOwn(MODULE_PATHS, fallbackTab) ? fallbackTab : 'home');
  const writeUrl = (tab, replace = false) => {
    const path = MODULE_PATHS[tab];
    if (!path) return;
    const url = `${path}${browser.location.search}${browser.location.hash}`;
    if (`${browser.location.pathname}${browser.location.search}${browser.location.hash}` !== url) {
      browser.history[replace ? 'replaceState' : 'pushState'](browser.history.state, '', url);
    }
  };
  const handlePopState = () => {
    const tab = moduleFromPath(browser.location.pathname) ?? 'home';
    writeUrl(tab, true);
    onChange(tab);
  };
  return {
    initialTab,
    start() {
      writeUrl(initialTab, true);
      browser.addEventListener('popstate', handlePopState);
      return () => browser.removeEventListener('popstate', handlePopState);
    },
    navigate(tab) {
      if (!Object.hasOwn(MODULE_PATHS, tab)) return;
      writeUrl(tab);
      onChange(tab);
    },
  };
}
