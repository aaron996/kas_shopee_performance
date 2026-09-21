# Local visual preview

Use this only to inspect the dashboard shell without signing in to Supabase. It
does **not** mint a session, bypass RLS, read live data, enable Dev Admin, call
the chatbot, join Realtime Presence, or create an access-log entry.

## Setup

Create an ignored `.env.local` file:

```dotenv
VITE_LOCAL_BYPASS_AUTH=true
VITE_LOCAL_BYPASS_EMAIL=local-preview@ghn.vn
```

`VITE_LOCAL_BYPASS_EMAIL` must satisfy the existing allowlist in
`src/utils/authPolicy.js`. The bypass also requires Vite development mode
(`import.meta.env.DEV`), so a production build cannot activate it even if the
environment value exists.

Run `npm.cmd run dev`, then open the local URL shown by Vite. Set the flag to
`false` or remove both values to restore the normal Supabase authentication
screen.

## Verification boundary

This mode is only evidence for UI layout and local interaction that does not
need authenticated data. Use an actual allowed Supabase account to verify RLS,
live data, chatbot behavior, Dev Admin capabilities, presence, access logging,
or production behavior.

The universal search remains available for tabs, clients, and regions. It does
not query COD rows in this mode, and the COD tab renders an explicit local-only
empty state instead of calling Supabase. Searching by driver name, driver ID,
or order code must be verified with an authenticated account.
