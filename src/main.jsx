import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'

// Embed support (Control Tower "Sức khỏe vận hành" tab): reports this
// page's real content height to whatever parent window has it in an
// <iframe>, so the host can size the iframe exactly instead of guessing a
// fixed min-height. No-op (harmless) when the app is not embedded — it
// only talks to a parent that itself loads the matching
// `iframeResizer(...)` script from the `iframe-resizer` package on its
// <iframe> element. See docs/control-tower-embed.md for the host-side setup.
import 'iframe-resizer/js/iframeResizer.contentWindow.min.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
