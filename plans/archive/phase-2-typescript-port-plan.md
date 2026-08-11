# Phase 2 — port the Python CLI to TypeScript

**Status:** done, shipped, merged.

## Objective

Port the core simulator (`model.py`/`simulate.py`/`schedule.py`, the load-bearing
survivors of Phase 1's cull) from Python to TypeScript, in a new `envelopes` repo, with
a live-updating browser UI and a preserved console CLI. Two hard conditions Luke set
going in: (a) YAML stays a first-class format with a CLI — it's the backend, not a GUI
convenience; (b) roll in the account-balance-over-time chart from the Python repo's own
`app/application.py`, with a visual warning on dropping below an account's floor.

## Tasks

- [x] `model.ts`/`simulate.ts`/`schedule.ts` ported from the Python originals.
- [x] `src/cli.ts` — the console tool, YAML in, same behaviour as `python -m fridge`
      verified to the cent against a real config.
- [x] A minimal live browser UI (superseded later by Phase 3's real six-section UI).
- [x] The account-balance-over-time chart with a floor-breach visual warning
      (`src/chart.ts`, later superseded by Phase 3's `simulation.ts`).
- [x] A real engine-simplification pass, prompted by Luke comparing the TS port
      unfavourably to the Python original's own plainness — explicit `for` loops
      replacing `.map()`/`.find()` chains, one `run()` signature instead of two.
- [x] Five model/config changes, decided while exploring the Phase 3 mockup and
      backported into the actual engine same session: `Account.who` dropped (an
      account's own name already says whose it is), `Goal.exit` dropped (superseded by
      the not-yet-built floor-breach mechanic), `sources`/`Source` dropped (confirmed
      dead, never read outside `model.ts`), `Account.saving` (boolean) replaced by
      `Account.kind` (`"everyday" | "saving" | "loan"`), `Account.offsets` added with
      real offset-interest math, `Goal.by_age` added as sugar resolved to a `by` date
      at load time.

## Decisions

- `Goal.contribution` dropped entirely, not renamed — traced through `simulate.py`, it
  was never actually read by the simulator, only by the closed-form solver Phase 1
  already deleted.
- `noUncheckedIndexedAccess` left off in `tsconfig.json` — mostly noise for a project
  this size (array/dict lookups safe by construction), rather than real bugs; plain
  `strict: true` still catches genuine null/undefined issues.
- "fridge" → "envelopes", "rhythms" → "transfers" renamed in the TypeScript model
  itself, matching the new repo's own name.
- A real bug caught by testing against a richer example config, not by a unit test: any
  goal referencing a non-saving account was flagged as debt by `debtAccounts()`, even
  for by-date/by-age goals whose `account` field is never actually read for their
  trigger. Fixed to check `kind === "loan"` specifically.

## Out of scope

- The real six-section UI, replacing the minimal demo (became Phase 3,
  `plans/archive/phase-3-ui-plan.md`).
- YAML view/load/save/share (became Phase 4b, `plans/archive/phase-4b-yaml-plan.md`).
