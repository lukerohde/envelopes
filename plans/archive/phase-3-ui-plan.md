# Phase 3 — the real UI

**Status:** done, shipped, merged, live.

## Objective

Build the real six-section UI (People's ages / Accounts / Transfers / Goals / Simulation
over time with Milestones nested inside) wired to the actual TypeScript engine, replacing
the old five-input demo. `phase-3-mockup.html` in this folder is the spec of record this
was built from — open it directly in a browser, it's self-contained.

## Tasks

- [x] Static six-section layout, styled per the mockup's token system.
- [x] People's ages: real inputs wired to `Budget.birthdays`.
- [x] Accounts: real inputs incl. Kind + Offsets, opening balance locks after creation.
- [x] Transfers: typed combobox From/To, dynamic "On" field (weekday / anchor-date /
      day-of-month / date), inflation checkbox.
- [x] Goals: trigger-type switch, editing/collapsed override lists (transfers + account
      rates), "stopped" tag on zeroed rows, cascading resolution so a transfer introduced
      by an earlier goal displays correctly in a later goal's override list.
- [x] Simulation over time: chart, dual-handle timeline, floor-breach detection, Future
      $/Today's $ toggle, Milestones read off the engine's real `completed` array.
- [x] Retire the old five-input `EDITABLE` demo in `main.ts`.
- [x] Playwright verification pass, light and dark mode.

## Decisions

- Per-transfer escalation is a plain "grows with inflation" checkbox, not a raw
  percentage — checked by default, matching the engine's own default.
- Goal account-rate overrides get their own override list ("Also change an account's
  rate"), same checkbox-plus-field pattern as the transfer override list.
- No "everyday account" hint needed.
- Fortnightly transfers need a real anchor date, not just a weekday — a weekday alone
  can't say which of the two alternating weeks.
- An account's Opening balance locks after creation, Kind/Rate/Floor/Offsets stay
  editable any time. (Later found to be over-locked in the actual implementation —
  fixed as part of the Phase 3 UX-feedback round, see git history.)
- No modals anywhere; every disclosure is inline.
- A goal's `account` field for a by-date/by-age trigger is never treated as a debt
  account just because it's named there.
- A floor breach is designed to stop the whole simulation run (Phase 4, not built yet)
  — the chart/timeline already assume this ("never reached" hatching).

## Out of scope

- Floor-breach termination (Phase 4).
- YAML import/export (became Phase 4b, see `../archive/phase-4b-yaml-plan.md`).
- The AI chat panel (Phase 6 / 6a).
