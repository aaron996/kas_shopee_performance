import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/operations-motion.css'
import App from './App.jsx'
import PopupCallback from './components/PopupCallback.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'

// Embed support (Control Tower "Sức khỏe vận hành" tab): reports this
// page's real content height to whatever parent window has it in an
// <iframe>, so the host can size the iframe exactly instead of guessing a
// fixed min-height. No-op (harmless) when the app is not embedded — it
// only talks to a parent that itself loads the matching
// `iframeResizer(...)` script from the `iframe-resizer` package on its
// <iframe> element. See docs/control-tower-embed.md for the host-side setup.
import 'iframe-resizer/js/iframeResizer.contentWindow.min.js'

// No client-side router in this app — this is the one exception. The
// popup opened for Google sign-in while embedded (see AuthModal.jsx) is
// redirected here by Supabase as a real top-level navigation, so it needs
// its own minimal render path instead of the full dashboard shell.
const isPopupCallback = window.location.pathname === '/auth/popup-callback'

// Same idea for /snapshot: a single bare report table for the n8n Telegram
// job to screenshot (see src/snapshot/SnapshotPage.jsx). Lazy so the
// dashboard bundle doesn't grow.
const isSnapshot = window.location.pathname === '/snapshot'
const SnapshotPage = lazy(() => import('./snapshot/SnapshotPage.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPopupCallback ? (
      <PopupCallback />
    ) : isSnapshot ? (
      <ToastProvider>
        <Suspense fallback={null}>
          <SnapshotPage />
        </Suspense>
      </ToastProvider>
    ) : (
      <ToastProvider>
        <App />
      </ToastProvider>
    )}
  </StrictMode>,
)

// index.html keeps the page white (html.boot-white) until React has painted the
// brand splash; hand the background back to the app once that layer is in place.
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.documentElement.classList.remove('boot-white');
}));
