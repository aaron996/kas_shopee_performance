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

// Distinct failure states — they look similar to the user but have very
// different causes, so keep them apart to stay debuggable.
const MESSAGES = {
  processing: 'Đang hoàn tất đăng nhập…',
  'no-session': 'Không nhận được phiên đăng nhập từ Google. Vui lòng đóng cửa sổ này và thử lại.',
  'no-opener': 'Mất liên kết với cửa sổ báo cáo. Vui lòng đóng cửa sổ này và thử lại.',
  failed: 'Đăng nhập không hoàn tất. Vui lòng đóng cửa sổ này và thử lại.',
};

export default function PopupCallback() {
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // supabase-js parses the OAuth redirect (tokens arrive in the URL
        // hash on the default implicit flow) during client init, and
        // getSession() awaits that before resolving — safe to call right
        // on mount.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !session) {
          console.error('Popup callback: no session after OAuth redirect', error);
          setStatus('no-session');
          return;
        }

        if (!window.opener) {
          // Either opened directly (not as a popup), or the browser severed
          // the opener link. The usual cause of the latter is this page
          // being served with a Cross-Origin-Opener-Policy other than
          // `unsafe-none`: the popup's navigation chain (Supabase → Google
          // → back here) runs at `unsafe-none`, so any stricter value here
          // makes the browser swap browsing context groups and null out
          // window.opener. See the /auth/popup-callback header override in
          // vercel.json — don't "harden" that value without re-testing the
          // embedded login flow end to end.
          console.error('Popup callback: window.opener is null — cannot hand the session back');
          setStatus('no-opener');
          return;
        }

        window.opener.postMessage({ type: 'ghn-auth', session }, SELF_ORIGIN);
        window.close();
      } catch (err) {
        if (cancelled) return;
        console.error('Popup callback failed:', err);
        setStatus('failed');
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
      <p>{MESSAGES[status] || MESSAGES.failed}</p>
    </div>
  );
}
