import React, { Suspense } from 'react';
import LoadingScreen from '../components/LoadingScreen.jsx';
import UnderDevelopmentOverlay from '../components/ui/UnderDevelopmentOverlay.jsx';
import { getModule } from './moduleRegistry.jsx';

function ModuleSurface({ module, runtime, onBackToOverview }) {
  const Surface = module.surface;
  const content = (
    <Suspense fallback={<LoadingScreen text={module.loadingText || `Đang mở ${module.label}...`} option={4} />}>
      <Surface {...runtime} />
    </Suspense>
  );

  if (!module.overlay) return content;
  return (
    <UnderDevelopmentOverlay
      description={module.overlay.description}
      onBackToOverview={onBackToOverview}
    >
      {content}
    </UnderDevelopmentOverlay>
  );
}

export default function ModuleSurfaceOutlet({ activeModuleId, runtimeByModule, currentUser, warmModuleIds, onBackToOverview }) {
  const activeModule = getModule(activeModuleId);
  if (!activeModule || (activeModule.requiresDevAdmin && !currentUser?.isDevAdmin) || (activeModule.requiresAuth && !currentUser)) return null;

  const warmModules = warmModuleIds
    .map(getModule)
    .filter(Boolean)
    .filter(module => module.keepMounted)
    .filter(module => !module.requiresAuth || currentUser);
  const regularModule = activeModule.keepMounted ? null : activeModule;

  return (
    <>
      {regularModule && (
        <div key={activeModuleId} className="tab-view-content">
          <ModuleSurface
            module={regularModule}
            runtime={{ ...runtimeByModule[regularModule.id], active: true }}
            onBackToOverview={onBackToOverview}
          />
        </div>
      )}
      {warmModules.map(module => (
    <div
      key={module.id}
      style={module.id === activeModuleId ? undefined : { display: 'none' }}
    >
      <ModuleSurface
        module={module}
        runtime={{ ...runtimeByModule[module.id], active: module.id === activeModuleId }}
        onBackToOverview={onBackToOverview}
      />
    </div>
      ))}
    </>
  );
}
