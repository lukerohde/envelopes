# envelopes — making the tool legible to AI agents

Implementation brief, phased. Each phase is one commit.

**Context:** an agent handed a share link decoded the fragment, reimplemented
the projection engine in Python rather than running the real one, and never
found `llms.txt`. It made no request to the origin, so no server-side change
could have caught it.

**Provenance:** the first draft of this brief was written by that same agent,
from outside — it had the deployed page and a share link, never the repo. Its
diagnosis was sound and most of its findings hold up. Its estimates of what
each fix *costs* were guesses. This version is the same brief re-checked
against the code; where the original was wrong, the correction is called out
inline as **was:** so the reasoning isn't lost.

**Ordering rationale:** Phase 0 gives everything else a test harness. Phase 1
is the cheapest discovery win. Phase 2 exports the codec, which Phase 3's
docs then depend on — the original had these the other way round and would
have documented agents hand-rolling gzip, which `llms.txt` currently and
deliberately tells them not to do. Phases 6–9 are engine and schema work,
each depending on the one before.

---

## Phase 0 — Give the engine a regression test

`commit: test: end-to-end milestone snapshot for the example config`

Nothing runs a whole config and checks the milestones don't move.
`tests/cli.test.ts` exercises `formatReport` against a four-line inline
config; every other test is a unit. Phases 5–9 all change engine behaviour,
and without this we'd be eyeballing dollar figures to know if we broke
something.

**was:** "decode the share link to `fixtures/early-retirement.yml` and commit
it." A real household plan doesn't go in the repo — real balances, real
birthdays, public repo. **That goes for this file too: no real figures, dates
or balances from anyone's actual plan belong in a plan document.** Illustrate
with `src/example.yaml`, which is fictional and committed. It now lives untracked in `user-budgets/`, and `src/example.yaml`
is the committed fixture. It's the same shape (offset mortgage, bridge fund,
super, three age- and balance-triggered goals handing off in sequence), so it
exercises everything the real plan does.

- [x] Snapshot `src/example.yaml`'s milestones and closing balances to
      `tests/fixtures/example.expected.json`
- [x] Test: run `src/example.yaml` through `simulate()` from a **fixed**
      start date, diff against expected. Not `todayISO()` — the suite would
      fail tomorrow. The start date and horizon live *in* the snapshot, so
      there's one copy of them and the fixture says what it's a snapshot of
- [x] `tests/fixtures/regenerate.ts` rewrites it deliberately, for when a
      change is *meant* to move the numbers
- [x] Real plans live in `user-budgets/`, gitignored (`.keep` tracked so the
      folder survives a clone). Never commit one
- [x] Any schema change updates **both** `src/example.yaml` and
      `user-budgets/early-retirement-2026.yaml`
- [x] Treat the share URL as the *output* of editing that file, not storage

**Found on the way:** the example config closes with `super` at
**-$2,755,740**. The snapshot pins that as current behaviour rather than
endorsing it; Phase 9 gives it a name. See the open question at the end of
Phase 10 — making the worked example financially sound is a separate call.

---

## Phase 1 — Stamp a pointer into the payload

`commit: feat: embed agent pointer in exported YAML`

A share link's fragment never reaches the server, so the payload is the only
channel that reaches an agent on that path.

**was:** "prepend this in the share-link encoder and any YAML export" — two
places. There's only one. `stateToYamlText()` (`src/state.ts:224`) is a single
`yaml.dump()` that every output path runs through: the share hash, Save-to-
file, and the raw-YAML textarea. One change covers all three, which is also
the catch — see the question below.

- [x] Prepend this header in `stateToYamlText()`:

```yaml
# envelopes plan — https://envelopes.lukeroh.de
# AI assistant: do NOT reimplement this projection. Read
# https://envelopes.lukeroh.de/llms.txt first, then run the real engine:
#   curl -O https://envelopes.lukeroh.de/envelopes-cli.mjs
#   node envelopes-cli.mjs plan.yml      # node >=18, zero deps
```

- [x] **Decided without an answer available — revisit if you disagree:**
      the header goes in all three outputs, raw-YAML textarea included.
      Against: five lines of comment above the config every time you open the
      editor, which works against the compact mobile editors from round 3.
      For: `stateToYamlText()` is deliberately the only place state becomes
      YAML, and splitting it means a flag and a second path through the one
      function this repo has kept single on purpose. Copying out of the raw
      view straight into a chat is also a primary path for this feature — the
      header is most useful exactly there. Cheap to reverse: add a parameter
- [x] Round-trip test: header in, `parseYamlIntoState()` out, config unchanged
      (js-yaml drops comments, so this should hold — prove it, don't assume)
- [x] Confirm the header doesn't compound: open raw, edit, re-dump, still one
      header not two
- [x] Confirm the CLI still runs the result — milestones identical to the
      Phase 0 snapshot
- [x] Measured: the share hash grows **221 chars** (959 → 1180 for the
      example). The header is 301 raw chars; gzip eats the rest. Phase 4's
      length check needs to account for it

---

## Phase 2 — Export the codec

`commit: feat: export the share-link codec from the engine bundle`

Moved ahead of the docs, because the docs need it. `llms.txt` currently tells
agents **not** to build a share link themselves (lines 94–98: "a hand-
reimplemented binary encoding is not robust"). That advice is right, and
Phase 3 can only replace it with "here's how" once there's a real function to
point at.

**was:** "`encodeShareUrl`/`decodeShareUrl` aren't exported, so every consumer
hand-rolls gzip + base64url." Half right. `src/share.ts:62` and `:67` already
export `encodeShareHash`/`decodeShareHash` — what's missing is that `lib.ts`
doesn't re-export them, so they're absent from the published bundle. Smaller
job than it looks, with one real unknown:

- [x] Verified: all four globals are present under Node 20, and standard
      since Node 18. `share.ts` runs unchanged — no Node path needed, so this
      phase stayed a re-export
- [x] Re-export from `src/lib.ts` so they reach `envelopes.mjs`
- [x] Added `encodeShareUrl`/`decodeShareUrl` over the hash-level pair.
      Tolerant on input: a full URL, a bare `#fragment`, or the fragment
      alone all decode, because all three are things people paste. A URL with
      no fragment gets a message saying so rather than a gzip error
- [x] Both are `async`; said so in the export comment and in `llms.txt`
- [x] Test: YAML → URL → YAML round-trips **through the built bundle**, not
      just the source, and the result still simulates
- [x] Test: a fragment gzipped by Node's `zlib` decodes via
      `DecompressionStream`. If those two ever disagreed, a link made in the
      browser would die in the CLI and nothing else would have caught it
- [x] Measured for `llms.txt`: `envelopes.mjs` 72KB, `envelopes-cli.mjs` 70KB

---

## Phase 3 — Teach `llms.txt` the other half

`commit: docs: cover reviewing, fetching and updating an existing plan`

**was:** "today it only covers blank-page authoring. Three sections missing."
One of those three already exists. `llms.txt` is ~500 lines and already
covers getting the module (both `curl` commands, both usage styles, at lines
107–123), the full schema, a worked example, and real review advice about
drawdown-versus-spending mismatches. What's genuinely absent is everything
about a plan that *already exists*.

- [x] **"You've been handed an existing plan"** — the decode recipe. There is
      nothing about this today, and it's the exact gap that caused the
      original failure. Give the Node one-liner using Phase 2's exported
      `decodeShareUrl`, and a dependency-free Python fallback for a
      Python-only sandbox:

```bash
python3 -c "
import base64, gzip, sys
s = sys.argv[1].split('#',1)[1].replace('-','+').replace('_','/')
open('plan.yml','wb').write(gzip.decompress(base64.b64decode(s + '='*(-len(s)%4))))
" "<share url>"
```

- [x] Replace the "don't build a share link yourself" paragraph (lines 94–98)
      — it's correct advice against hand-rolling, wrong once there's an
      exported codec. Keep the warning, point it at the function
- [x] **Promote the review advice into a named checklist.** It's currently
      prose in the last paragraphs of the worked example, where an agent
      skimming for a schema will miss it: accounts ending negative, savings
      below inflation, sinking funds that trend, goals that never fire, super
      drawn before preservation age, drawdown size against the spending it
      funds
- [x] **"How to update someone's plan"** — all four steps, since without
      step 4 the edit is stranded in the chat: decode → edit with **minimal
      diffs** (goals reference transfers and accounts by exact string, so
      names must stay stable) → re-run and show before/after milestones →
      re-encode and hand back a new link
- [x] Note the fallback: paste YAML into the site directly when the URL is long
- [x] **"How to iterate toward a workable plan"** — a 40-year projection runs
      in milliseconds, so an agent scripts its own experiments rather than
      asking for engine features. Document the options, which are real but
      undocumented (`src/lib.ts:27`):

```js
import { simulate } from './envelopes.mjs';
// takes the YAML *text*, not a parsed object
const s = simulate(yamlText, {
  years: 40,            // default 40
  start: '2026-08-12',  // default today
  track: ['pay', 'early retirement']   // per-account daily timeseries
});
s.completed   // [["pay off the house","2032-11-05"], ...]
s.balances    // closing balances
s.history     // { "pay": [["2026-08-12", 3200], ...] }  ~14,600 rows
```

- [x] **Variant diffing** — copy the YAML, change one thing, re-run, diff
      `completed`. That's how you answer "what if we retired at $500k"
- [x] **Sensitivity** — loop over each transfer amount, bump it, record the
      milestone deltas, sort by effect size. A few dozen runs, still under a
      second, and it tells the agent which knobs actually matter before it
      starts guessing
- [x] The exports list the original gave was checked and is correct: `load`,
      `run`, `simulate`, `report`, `formatReport`, `ageAt`, `addDays`,
      `todayISO`. Phase 2's codec added, and the whole list is now a table
- [x] **Restructured, beyond what was asked.** The file opened with a
      blank-page interview script, so an agent arriving *with* a link had to
      read past instructions telling it to interview someone before finding
      anything relevant. Added a two-way router at the top, and moved the
      engine section above the point where the decode recipe needs it
- [x] `tests/llms-txt.test.ts` — nobody runs a text file, so it can rot for
      months with no symptom. Parses the exports table and asserts every
      function it advertises exists in the bundle, plus that the removed
      advice stayed removed
- [x] Ran the documented Python fallback against a link this codebase
      encoded: decodes byte-identical to `src/example.yaml`. The one recipe
      no test can cover, so it was checked by hand

---

## Phase 4 — Shorten the copy prompt

`commit: feat: copy prompt carries the live plan URL`

The prompt is a pointer, not a payload — the instructions live in `llms.txt`.
It stays in the collapsed `<details>` and doesn't need to be readable on the
page; the user reads it where they paste it.

**was:** "replace the current four-line prompt." It's one paragraph in a
`rows="4"` textarea at `index.html:539`, and it's static markup — nothing
interpolates anything into it today, the button just copies. So the framing
inverts: the *existing* text is already the no-plan-yet variant, and the new
work is a with-plan variant plus the JS to switch between them.

- [x] Keep today's text as the no-plan case, trimmed to point at `llms.txt`
      rather than restating what it says
- [x] Add the with-plan variant:

```
I'm using envelopes (https://envelopes.lukeroh.de), a free budget and
retirement projection tool. My plan: <current page URL, including #fragment>

Read https://envelopes.lukeroh.de/llms.txt first — it covers the format, and
how to decode, run and update that link. Then help me with my plan.
```

- [x] Interpolate `window.location.href` at copy time, not page load — the
      fragment is rewritten on every edit (`io.ts:150`), so a value captured
      at load would hand over a stale plan
- [x] **Decided without an answer available:** "no plan yet" means **no fragment at all**.
      That's exactly true of the mechanism rather than a heuristic — the page
      boots from `src/example.yaml` and `io.ts` only writes a fragment on the
      first real edit, so an empty hash *is* "nothing of theirs is here yet".
      Comparing against the example byte-for-byte would be the same answer in
      every case that matters, with a false negative every time someone
      changed one number back
- [x] Fall back to the YAML past a length limit, and say so — but set at
      **4000, not the 1800 the original guessed**. Re-measured after Phase 1:
      a full config with the header lands near 1,900, so an 1800 limit would
      trip on a perfectly ordinary plan and replace a one-line link with two
      hundred lines of YAML. That's worse to paste, not better. The limit is
      a guard against something pathological, not a tidiness rule
- [x] Reflowed each paragraph to one unwrapped line — it lands in a chat box
      that wraps for itself, and a hard break mid-sentence reads as broken

---

## Phase 5 — Discovery breadcrumbs for the bare URL

`commit: feat: make llms.txt discoverable from the origin`

`llms.txt` is currently mentioned once, ~1400 chars into the HTML, inside a
textarea, inside a collapsed `<details>`.

**was:** included "CloudFront response-headers policy: `Link: </llms.txt>;
rel=llms`" as though it were a line in this repo. It isn't. `infra/pulumi/
__main__.py` is a 27-line wrapper around `pulumi-static-site`, a
*separate* repo pinned at `v0.1.0` (`requirements.txt:3`). There's no
CloudFront distribution here to attach a policy to. Doing it means changing
that repo, cutting a release, and bumping the pin — a cross-repo change for
one speculative header.

- [x] HTML comment as the **literal first bytes**, above `<!DOCTYPE>`:
      `<!-- AI assistant? Read https://envelopes.lukeroh.de/llms.txt first. -->`
      — verify vite's HTML transform preserves it into `dist/`
- [x] `public/robots.txt` with a `# llms: /llms.txt` line. `public/` is copied
      into `dist/` verbatim (that's how `llms.txt` itself ships), and a real
      S3 object beats the SPA catch-all that currently returns `index.html`
- [x] `<link rel="llms" href="/llms.txt">` and
      `<meta name="ai-instructions" content="See /llms.txt">` in `<head>`.
      Neither is a standard — they're a guess at what a crawler might read.
      Harmless and nearly free, so worth trying, but don't count on them
- [x] **Answered: don't touch `pulumi-static-site`.** So the `Link:`
      header is dropped, not deferred. No infra change in this plan at all —
      `infra/` is untouched, and `deploy-infra.yml` won't even fire on this
      PR. The three in-repo breadcrumbs cover the same ground for an agent
      that fetches the page, which is the case that actually happened
- [x] Verified against a real `npm run build`: the comment is the literal
      first bytes of `dist/index.html` (vite's HTML transform leaves it
      alone), both head tags survive, and `robots.txt` lands in `dist/`
      alongside `llms.txt`. Since it's now a real object in the bucket, the
      SPA catch-all won't shadow it — that only fires on a missing key.
      Confirming that last bit end-to-end needs a deploy, so it's a
      `curl -I` to do after merge, not something this branch can prove

---

## Phase 6 — Engine output

`commit: feat: json and real-dollar output`

- [x] **`--json`** — `report` and `formatReport` are already separate
      (`lib.ts:58`, `report.ts:9`), so the formatting split is done. What's
      missing is arguments: `cli.ts:19` reads `process.argv[2]` and nothing
      else, so this needs a small flag parser first
- [x] **`--real`** — deflate to today's dollars using `inflation`. $1.66M of
      super in 2038 reads as ~$1.16M now; an escalating drawdown shows flat
- [x] Both flags proved against the Phase 0 snapshot — the numbers didn't move
- [x] **Decided:** `--real` changes the *text* report; `--json` always emits
      nominal and real together. A flag that makes an agent re-run to see the
      other number is a bad flag, and JSON has room for both
- [x] `reportJson()` and `deflate()` exported from the bundle and added to
      the `llms.txt` table, with a note telling agents to prefer `--json`
      over parsing column-aligned text — the alignment is for humans, and a
      `padEnd` tweak shouldn't be able to break somebody's script
- [x] Worth recording what `--real` shows on the example: `super` closes at
      **-$2,755,740** nominal but far less in today's money. Same
      disaster, honestly scaled — which is the argument for the flag

**was:** this phase also carried "split the balances table by kind", which
can't be done before the kinds exist. Moved into Phase 7.

---

## Phase 7 — Account kinds

`commit: feat: replace three account kinds with six`

`everyday | saving | loan` is three names doing six jobs. Each kind below
earns its place with a distinct invariant — which is what makes Phase 9
possible.

| kind | example | invariant |
|---|---|---|
| `clearing` | `pay` | shouldn't trend — growth means unallocated surplus |
| `expense` | `groceries`, `bills`, `car` | pure pass-through; balance is cumulative spend |
| `sinking` | `travel` | fills and empties on a cycle; flat in real terms |
| `saving` | `early retirement` | accumulates to a target, then drains once |
| `investment` | `super` | `rate` should beat inflation; never goes negative |
| `loan` | `mortgage` | pays down to zero |

Checked how much of the engine this can break, and the answer is: almost
none. `kind` is read in exactly one place that affects the simulation —
`debtAccounts()` at `simulate.ts:80`, testing `=== "loan"`. Offsets don't
check kind at all. So as long as `loan` keeps its name, milestones can't
move. What *does* touch every kind is the UI: `groupAccounts()`
(`state.ts:93`) sections the accounts editor by kind, and the account
form has a kind selector — six values need a sensible order and labels.

- [x] Add the kinds; keep old values parsing as aliases (`everyday` →
      `expense`) so share links in the wild don't break
- [x] `load()` casts `kind` straight through with no validation
      (`model.ts:99`) — an unknown kind is silently accepted today. Reject it
      now that the set is meaningful, with a message naming the valid ones
- [x] Update `groupAccounts()` and the account editor's kind selector
- [x] Document them in the `llms.txt` schema section — the current text
      ("`everyday` is for pass-through spending") is written as prose per
      kind, so it grows to six
- [x] Apply them in the `llms.txt` worked example
- [x] Migrate `src/example.yaml` **and** `user-budgets/early-retirement-2026.yaml`
- [x] Re-run the Phase 0 snapshot — milestones must be unchanged. If they
      moved, something reads `kind` that this survey missed
- [x] **Split the balances table by kind** (moved from Phase 6) — don't
      suppress expense totals, but print them under *cumulative spend by
      category*, not *balances*. `groceries 1,197,776.46` under "balances"
      reads as a bug; under "spend since 2026" it reads as information

---


**Confirmed on the way:** the safety claim held exactly. The Phase 0 snapshot
passed untouched through the migration of `src/example.yaml` — same
milestones, same closing balances. Four existing tests failed, all of them
asserting the old vocabulary, none of them a number.

**Found on the way:** the offsets field was gated on `kind === "saving"` in the
accounts editor. A *sinking* fund offsetting a mortgage is a perfectly
ordinary arrangement, which the engine has always allowed and the UI would
have refused. Now gated on `canOffset()`, which excludes only `expense` (no money in
it to offset with) and `loan` (a loan offsetting a loan is just a smaller loan).

**Also:** `parseAccountKind()` is exported from `model.ts` because `state.ts`
parses YAML on its own path and has to read `kind` identically. Two copies
would mean a share link that loads in the app and fails in the CLI.
## Phase 8 — Annualised flow subtotals

`commit: feat: annualised in/out subtotals in engine, cli and ui`

The only diagnostic here that needs code — because it helps *you* balance
accounts by hand, not just the agent. Sensitivity tables and timeseries are
documented recipes instead (Phase 3), since the engine is fast enough that an
agent can generate its own.

Subtotals on ins and outs are the thing. The most informative check anyone
can do to a plan is reconciling the clearing account by hand — every envelope
and direct debit against what actually arrives. When those two agree to within
a few cents, the plan was deliberately calibrated rather than roughly guessed,
and that fact is invisible in every view the tool currently offers. Finding it
means arithmetic across four different cadences on paper.

**Segment by goal, not by year.** The goals already partition the timeline
into regimes (working → post-mortgage → bridge → super → drawdown).
A lifetime average spans all of them and means nothing.

- [x] `run()` returns balances, completed and history but records no flows —
      this needs a per-transfer accumulator inside `applyTransfers()`
      (`simulate.ts:116`), keyed by the phase the current day falls in
- [x] For each goal-delimited phase, per account: **in**, **out**, **net**,
      **closing balance**
- [x] Annualise to `$/year` so weekly, fortnightly, monthly and yearly
      transfers are directly comparable without arithmetic
- [x] Nominal and real side by side — real for flows (comparable across
      time), nominal for balances (what the bank will say)
- [x] **Unallocated surplus** per phase: income minus every outflow. That's
      whatever is pooling in the clearing account
- [x] **Years of cover** = balance ÷ annualised outflow. For the bridge fund
      this directly answers "does it reach preservation age"
- [x] Net-flow sign per account per phase, checked against the Phase 7
      invariant — Phase 9's lint rules are this at lower verbosity, so build
      them on the same code path
- [x] Surface the same subtotals in the UI, not just the CLI

---


**Decided:** `--flows` is a flag, not part of the default report — the table
is six columns across five phases and would bury the milestones. In the UI
it's its own collapsed section, "Where the money goes".

**Interest had to be a column.** Without it the table can't explain the
balance sitting next to it: on the mortgage, interest is $13,674/yr against
$10,398/yr of repayments on the example's mortgage, and on its `super` it's
$29,758/yr — the largest number in the row. `AccountFlow` carries a `debt` flag so the reconciliation
works for loans too, where arriving money *reduces* the balance. Read from
the run's own debt set rather than from `kind`, because a loan no goal
watches isn't treated as one.

**Cover is blank for expense envelopes and loans.** "How long does this
last" is meaningless for an envelope that only ever receives, and a loan's
end date is already a milestone.

**What it shows on `src/example.yaml`** — visible without arithmetic:
`travel` takes $6,015/yr in and pays $5,775/yr out, which is what a sinking
fund should look like, and the unallocated surplus line puts a number on
whatever the clearing account is quietly keeping in each phase.
## Phase 9 — `envelopes lint plan.yml --json`

`commit: feat: lint rules for common plan errors`

Named findings beat a table an agent has to interpret. Every rule below reads
the Phase 8 flow data plus the Phase 7 invariant — no new traversal.

- [x] `account-ends-negative` — any balance < 0 at horizon. `src/example.yaml`
      ends with `super` at **-$2,755,740** and nothing flagged it
- [x] `clearing-account-accumulating` — the example's `pay` ends at
      **$107,873**, i.e. ~$2.6k/yr of surplus going nowhere in particular
- [x] `saving-below-inflation` — `kind: saving`, `rate < inflation`, monotonic growth
- [x] `sinking-fund-trending` — inflow > outflow over a full cycle
- [x] `goal-never-fires` — goal not reached within the run. Cheap: `run()`
      already returns only the goals that fired, so it's a set difference
- [x] `super-before-preservation-age` — super drawn before the person turns 60
- [ ] ~~`unbounded-envelope` — `expense` account with no outflow path~~
      **Dropped, and it shouldn't come back.** An expense envelope having no
      outflow is exactly what `kind: expense` *means* — the balance is
      cumulative spend, so money in and none out is the correct shape. The
      rule would fire on every well-formed plan. The real worry behind it is
      a pot that should empty and doesn't, which is `sinking-fund-trending`

---


**It found the right things.** Checked against a real household plan (kept
out of this repo) the findings matched that plan's separately-computed figures
to the dollar — independent confirmation the flow accounting underneath is
right, not just plausible.

**One false positive, caught and fixed.** The first version accused both
super accounts of being raided at 48 and 44. Super fees and contributions tax
leave those accounts every month from day one, and the rule counted any
outflow as a drawdown. `AccountFlow` now tracks `drawn` separately — the part
of `out` that landed in *another* account — because a fee leaves the system
and a drawdown goes to you. Regression test added; a linter that cries wolf
on every plan gets switched off.

**`lint` exits non-zero when it finds something**, so it can sit in a script.
## Phase 10 — Schema gaps and config fixes

`commit: feat: conjunctive goal triggers`

- [x] **Conjunctive goal triggers.** Confirmed: `reached()` (`simulate.ts:173`)
      returns on `by` if it's set and falls through to the balance test only
      if it isn't — strictly one trigger or the other. So "bridge fund empty
      **AND** they turn 60" is unrepresentable, and that's the single most
      important guard in a retirement plan
- [x] **Decided without an answer available:** snap only on the day the balance actually
      crossed. Snapping is a rounding correction for checking once a day —
      it's what makes "paid off" land on 0.00 instead of -37.42 — so it's
      only ever right on the crossing day. A conjunctive goal that spent five
      years waiting on a birthday crossed long ago, and rewriting the balance
      then would invent or destroy real money. The run now tracks which goals
      were already at target at the last check, which is one `Set`. First
      attempt just refused to snap for conjunctive goals at all, and the
      example promptly ended with a fund frozen at -$6,528 — one fortnight's
      overshoot, kept forever. The crossing-day rule fixes that: it lands on
      exactly 0.00
- [x] **Sinking-fund outflows.** A sinking fund with money in and none out
      grows forever. Model Xmas, holidays and ad-hoc as `every: year`
      transfers
- [x] Both changes go into `src/example.yaml` as well — it has the same two
      gaps, and it's what every agent reads as the worked example

### Applying all this to a real plan (not a repo change)

Real household plans live in `user-budgets/`, gitignored. Migrating one to the
new account kinds, setting an offset account against the mortgage, and adding
the preservation-age guard are all done locally against that file, and the
share URL re-issued afterwards. **Their numbers and dates stay out of this
file** — see the note at the top of Phase 0.

---


**Design decision — `wait_for_both`, not inferred.** The obvious schema is
"both fields present means AND". It would have broken every share link in
existence: `goalToRaw()` writes `account` and `target` on *every* goal the UI
emits, date- and age-triggered ones included, where they've always been
ignored. Inferring AND would silently turn each of those into a goal that
might never fire. So it's an explicit opt-in, and the UI carries the field
through the round-trip even though no control sets it yet — otherwise loading
a plan that uses it and re-sharing would quietly drop it.

**Found while writing the worked example:** trigger direction is inferred from
the account's *opening* balance, so a fund that starts at `0`, fills, and
drains cannot say "back to empty" — `target: 0` reads as "at or above 0",
true on day one. Not fixed (it would change existing plans' meaning); it's
documented in `llms.txt` as a trap, and the example gives its bridge fund a
real opening balance so the guard actually guards.

**Not done, and it's a judgement call:** `src/example.yaml` still lints with
`account-ends-negative` on `super` (-$2.76M) and `clearing-account-accumulating`
on `pay` ($107,873).
Making it a genuinely sustainable plan means choosing real drawdown and
spending numbers, which is financial design of a teaching artefact rather
than the two schema fixes this phase asked for — so I stopped. I did try:
stopping the drawdown when super runs out just moves the hole into `pay`
(-$1.85M), because the spending keeps going. The linter now names both, which
at least means nobody copies it without being told.
## Later

- [ ] Solver: bisect one free variable against a constraint, e.g.
      `--vary "early retirement.target" --require "super > 0 at age 95"`
- [ ] Publish a SHA-256 of the module in `llms.txt` so agents can verify what
      they downloaded
- [ ] stdio MCP server, if mobile or non-sandbox clients ever matter
