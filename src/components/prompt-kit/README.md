# Prompt Kit — selected components

Manual source installation from https://github.com/ibelick/prompt-kit on 2026-10-20.
Upstream files: `components/prompt-kit/text-shimmer.tsx` and `loader.tsx`.

Adapted to JSX and scoped CSS for the existing React/Vite app; no Tailwind,
shadcn initialization, runtime dependency, or global reset is required.
Preserve the accompanying MIT license when redistributing.

Installed exports:
- `TextShimmer`: `as`, `duration`, `spread`, `className`, `style`, standard HTML props.
- `Loader`: selected `typing`, `dots`, `pulse-dot`, and `text-shimmer` variants;
  `sm`, `md`, `lg` sizes; `text` provides the accessible status label.

Styles inherit GHN `--text-primary` / `--text-secondary` and support dark mode,
reduced motion, and forced colors. These are adapted components, not the full
Prompt Kit registry. Additional components should be added individually.

ChatPanel uses TextShimmer while waiting for its existing SSE status events.
It stops rendering the shimmer as soon as answer content or an interaction arrives.
