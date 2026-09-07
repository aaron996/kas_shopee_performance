import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// Rendered at /auth/popup-callback — see docs/control-tower-embed.md.
//
// This page only exists to close the loop of the popup-based Google OAuth
// flow used when the app runs embedded in Control Tower's iframe:
// Google's login page refuses to render inside any iframe, so AuthModal
// opens it in a real top-level popup window instead. Supabase redirects
// that popup back here once the OAuth exchange is done; this component
// reads the resulting session and hands it to the window that opened the
// popup (the iframe, same origin as this page) via postMessage, then
// closes itself. The iframe's own message listener (see App.jsx) picks it
// up and calls supabase.auth.setSession(...), which writes into the
// iframe's own (partitioned) storage — exactly where it needs to live.
const SELF_ORIGIN = window.location.origin;

export default function PopupCallback() {
  const [status, setStatus] = useState('processing'); // processing | error

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // supabase-js parses the OAuth redirect (code/hash) during client
        // init and getSession() awaits that before resolving, so this is
        // safe to call immediately on mount.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !session) {
          console.error('Popup callback: no session after OAuth redirect', error);
          setStatus('error');
          return;
        }

        if (!window.opener) {
          // Opened directly (not as a popup, or opener link was severed) —
          // nothing to hand the session back to.
          setStatus('error');
          return;
        }

        window.opener.postMessage({ type: 'ghn-auth', session }, SELF_ORIGIN);
        window.close();
      } catch (err) {
        if (cancelled) return;
        console.error('Popup callback failed:', err);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'var(--font-body, sans-serif)',
        textAlign: 'center',
        padding: '2rem',
        color: '#334155',
      }}
    >
      <p>
        {status === 'error'
          ? 'Đăng nhập không hoàn tất. Bạn có thể đóng cửa sổ này và thử lại.'
          : 'Đang hoàn tất đăng nhập…'}
      </p>
    </div>
  );
}
