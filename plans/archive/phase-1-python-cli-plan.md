# Phase 1 — build retirement goals into the CLI

**Status:** done, shipped. Lives here for posterity — the actual work happened in the
sibling `cashflow` repo (this project's Python origin), which doesn't use this `plans/`
convention. Committed there as `phase-1-cull-dead-modules`, git history labels the cull
commit itself "Phase 1."

## Objective

Get the Python CLI down to a clean, minimal engine whose whole job is simulating
retirement goals: accounts, transfers, and goals-with-overrides, day by day. The
codebase had grown a lot of machinery over time that no longer served that job — a
closed-form solver, a spreadsheet workbook generator, separate bridge/ledger/phases
modules — carried weight without earning it. Phase 1 was cutting down to what actually
mattered, not adding new capability: `model.py`/`simulate.py`/`schedule.py` already
modelled accounts, transfers ("rhythms"), and goals-with-overrides correctly; everything
else was dead weight around a working core.

## Tasks

- [x] Identify what's actually load-bearing vs. dead weight — only
      `model.py`/`simulate.py`/`schedule.py`/`__main__.py` (~437 of ~1341 lines) turned
      out to be load-bearing.
- [x] Delete `bridge.py`, the old `goals.py`, `ledger.py`, `phases.py`, `solve.py`,
      `transfers.py`, `workbook.py`, and their tests.
- [x] Confirm the remaining CLI still models accounts/transfers/goals-with-overrides
      correctly with nothing load-bearing lost.

## Decisions

- Keep the Python engine as a going concern (not deleted once the TypeScript port
  existed) — Luke wanted to keep it explicitly as a comparison point for the JS port's
  behaviour, run side by side against the same configs.
- The renamed concepts — "fridge" → "envelopes", "rhythms" → "transfers" — were decided
  but only actually renamed in the TypeScript port (Phase 2). The Python code keeps its
  original names; the repo split made that renaming moot for `cashflow` itself.

## Out of scope

- Anything TypeScript or web-facing — that's Phase 2
  (`plans/archive/phase-2-typescript-port-plan.md`).
