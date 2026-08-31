# envelopes — opening-balance start date (plan-level `start_date`)

## Objective

A saved plan silently re-anchors itself to "today" every time it is reopened
or re-shared: the page always ran from `todayISO()`, and the CLI's `--start`
flag was the only way to fix a start, with no way to bake one into the YAML.
So a balance captured on 15 August was quietly treated as today's balance a
month later, and the same share link gave a different answer next month.

The Python engine this was ported from had the answer at scenario level —
`start_date` in the config, with `opening_balance` as-of that day — and the
port dropped it. This change restores it:

- `start_date` in the plan YAML is parsed onto `Budget.startDate`.
- The simulation, CLI, library, and UI all start from it when present.
- Absent, they fall back to today — the legacy behaviour, unchanged for
  every plan already in circulation.
- The date survives Save/Share round-trips, so a shared plan is
  deterministic across time: the same link gives the same answer next month.

## Tasks

`commit: feat: anchor plan projection to a saved start_date instead of today`

- [x] `model.ts`: parse `start_date` from the plan YAML onto
      `Budget.startDate`; default to today at load (legacy behaviour)
- [x] `cli.ts`: start from `budget.startDate` unless an explicit `--start`
      wins; fall back to today for plans with no `start_date`
- [x] `lib.ts`: same precedence in `simulate()` — caller `start` beats the
      plan's saved date beats today
- [x] `ui/simulation.ts`: anchor the chart, horizon, milestones and flows to
      `budget.startDate`, not `todayISO()`, so reopening a plan doesn't shift
      the whole projection
- [x] `state.ts`: `startDate` in UI state, read from and written back to the
      YAML, so Save and Share keep the anchor
- [x] Tests in `tests/start-date.test.ts`: parse, today-default, and
      anchor-not-today (the simulation opening balance does not re-anchor)
- [x] Round-trip regression tests (added at verification): start_date
      survives state → YAML → state, and the share-link codec — the two
      paths the "same link, same answer" promise is made of
- [x] Full suite green (401 tests), production build green (`npm run build`)

## Decisions

- **Scenario-level `start_date`, not per-account `as_of`/start.** The task
  was created with the question open: does "opening balance start date" mean
  a date the whole scenario runs from, or a per-envelope balance as-of date?
  Luke chose the scenario-level anchor (shape A in the task research) — it
  restores exactly what the original Python engine had, makes shared plans
  deterministic, and is a strict subset of the work per-account dates would
  need anyway. Per-account `as_of` stays out of scope; revisit only if a
  real plan really needs balances captured on different days.
- **Explicit `--start` beats the saved `start_date`.** The flag exists for
  comparing variants across a session; it must still be able to hold the
  run still even when the plan carries its own date. Precedence is
  `--start` → `start_date` → today, in `cli.ts` and `lib.ts` alike.
- **Default is today at load, not "no date".** `Budget.startDate` is always
  a real ISO date. A plan without `start_date` behaves exactly as before;
  nothing downstream has to branch on "was it set?".
- **`start_date` is not a UI editor field.** The raw-YAML editor is the
  way to set it — the same first-class input surface as the rest of the
  config. A dedicated date picker can come later if the tool's own use
  wants one.

## Out of scope

- Per-account/per-envelope `as_of` or start dates (the "B" shape the task
  research distinguished; the simulator does not grow or transfer an account
  from its own opening day)
- `end_date` in the YAML — the horizon rule (youngest person turns 100)
  still decides where the run stops; `start_date` only moves where it starts
- Any change to plans already in circulation: no `start_date` means
  behaviour is byte-for-byte the old "from today" run