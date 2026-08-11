# Phase 4b — raw YAML view, load/save, and a stateless share link

**Status:** done, shipped, merged, live.

## Objective

Let Luke (and anyone else) actually see and share their own budget, without this app
ever needing a server to maintain state. Pulled forward from the six-phase vision's
"YAML import/export" phase — done early because it's what makes the tool useful to
someone who isn't Luke poking at `example.yaml`.

## Tasks

- [x] `src/share.ts`: gzip + base64url encode/decode for a share link, round-trip
      tested directly, no DOM needed.
- [x] Raw YAML view toggled against the structured view, same `UIState` underneath.
- [x] Save as a downloaded `.yaml` file.
- [x] Load from a chosen `.yaml` file, replacing the live state.
- [x] "Copy share link" button; a URL fragment present at startup wins over the
      default example.
- [x] Playwright verification: raw-view round-trip, save/load round-trip, share-link
      round-trip into a brand-new page.

## Decisions

- Compression via the browser's native `CompressionStream`, not a library — a real
  config runs a few KB as plain YAML, gzip keeps a shared link comfortably short.
- The share payload lives in the URL **fragment**, never a query param — a fragment
  never leaves the browser in the HTTP request, so it's never sent to or logged by a
  server. This is the actual mechanism behind "share it without the server
  maintaining state."
- Explicit "Copy share link" button, not a live-rewriting address bar — rewriting
  `location.hash` on every keystroke would spam browser history for no reason.

## Out of scope

- Any real persistence beyond a downloaded file and a URL — still no backend, no
  accounts, no login.
- The AI chat panel (Phase 6 / 6a).
