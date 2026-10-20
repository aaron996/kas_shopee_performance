# Chat UI — assistant-ui

`ChatPanel` keeps ownership of authentication, quota, `/api/chat` SSE parsing,
request context, retry payloads, and conversation history. `useExternalStoreRuntime`
connects this state to assistant-ui primitives; no Assistant Cloud service is configured.

- `ThreadPrimitive.Root`, `Viewport`, `Messages`, and `MessagePrimitive.Root`
  render the conversation and manage scrolling. Reading older messages pauses
  bottom following; the “Tin mới nhất” button returns to the bottom.
- `ComposerPrimitive` owns the draft, keyboard submission, Send, and Cancel.
  Its runtime remains mounted while the panel is closed, preserving the draft.
  Escape still collapses the expanded window before closing it.
- `ActionBarPrimitive.Copy` copies the raw message text. “Hỏi lại” sends a new
  turn with the original question, structured query, and screen context. It costs
  a new quota turn and does not replace or branch the original answer.
- `ChatQueryCard`, `ChatMessageMarkdown`, the mascot, collapsed data details,
  and Prompt Kit loaders remain the GHN components.
- Stop aborts the active request and preserves the received text with a stopped
  label. Partial text remains part of subsequent conversation history.

`src/utils/chatAssistantUi.js` adapts committed, pending, and failed messages.
Stable turn IDs prevent remounting when streaming becomes a completed answer.
Always pass `convertAssistantUiMessage` to the runtime: the adapter returns
`ThreadMessageLike` values, which require normalization before primitives use them.
The metadata carries the original interaction and its index for selection updates.
Pending data sources are hidden until completion.

## Validation

- `node --test src/utils/chat*.test.mjs src/utils/mascotState.test.mjs server/chat/*.test.mjs`
- `npm run build`
- Focused oxlint and `git diff --check` on changed source.
- Local fixture in `output/assistant-ui-qa/`: mocked auth and fetch; a separate
  build plugin replaces the Supabase import only in that fixture. Unknown fetches
  are blocked. The real `ChatPanel` runs unchanged against synthetic SSE events.
- Codex IAB checks cover Enter, Shift+Enter, draft preservation, expand/Escape,
  streaming, copy, ask again, cancel, error/retry, quota, structured interaction,
  scroll-to-bottom, and 390px mobile/light and dark layouts.

Fixture checks do not establish authenticated production or real-model behavior.
Backend route and business data logic are unchanged by this UI integration.
## Waiting motion and long reasoning

Pending messages and the header reuse Prompt Kit's bouncing-dot loader, including its reduced-motion styles. The message indicator disappears when text arrives; the header indicator remains until the turn finishes or is cancelled.

The default turn deadline is 180 seconds (`AI_CHAT_TURN_TIMEOUT_MS` can override it); the Vercel function allows 300 seconds. Keep the selected model and reasoning effort unchanged. Send SSE comment heartbeats every 10 seconds during an active turn and clear the timer on completion, failure or disconnect.

Raw SDK streams can end quietly after their abort signal fires. Check the signal before treating EOF as a missing `response.completed`, so a deadline reports `CHAT_TIMEOUT`. For genuine missing-terminal EOF before any text, retry synthesis once without streaming using the existing evidence. Do not replay tools, retry after cancellation/partial text, or accept incomplete fallback output.
