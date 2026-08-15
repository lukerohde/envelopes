# envelopes — round 3: the friction a passing agent still hit

## Objective

Round 2's harness worked. A fresh agent, handed nothing but `llms.txt` and the
published bundle, built Luke a real budget and got there. That is the first
time that's happened, and it means this round is not about a broken harness —
it's about the places the agent still lost time, and the two things it got
wrong that it couldn't see itself.

Its own words, which are most of the spec for this round:

- **`account:` is required on every goal, including pure date and age
  triggers.** The schema presents `by:`/`by_age:` as *alternatives* to
  `account`+`target`, and `llms.txt` says the latter are "ignored" for those
  triggers. Omitting them throws `Error: no such account: undefined` with a
  stack trace into minified bundle internals — no line number, no goal name,
  and `lint` throws the same before it can say anything. The agent bisected
  its goals list to find it.
- **A `once` transfer introduced inside a goal's overrides, dated the same day
  that goal fires, silently never executes.** The lease balloon just sat
  there. Nothing errored, nothing linted; it was only caught by checking the
  account balance by hand.
- **Annualised figures on very short phases are misleading.** Two milestones
  landed 24 days apart, `--flows` reported that 0.1-year window at
  $248,202/yr in, and `check` used it to fail
  `clearing-account-accumulating` at "$5,981/yr that no later phase uses" —
  pointing at the wrong goal entirely. Worse, the fix direction wasn't even
  monotonic: retaining $12,000 in the sweep failed, $10,000 passed, $8,000
  failed harder.
- **No `--help` and no `--start` on the CLI**, though `simulate()` takes
  `start`. So the CLI and the library silently disagree about when a run
  begins, which matters when you're diffing variants.

It also flagged a *non-bug* it nearly reported: a transfer with `out_of` and no
`into` is fine. It had changed two things at once. Nothing to do — recorded so
nobody goes looking.

**Two more, which the agent couldn't report about itself:**

- **It never interviewed him.** It went straight into the numbers without
  asking what he was actually aiming at, and without restating it back before
  it started changing things. The interview isn't missing from `llms.txt` —
  round 2 put it in — it's in the wrong place. The handed-a-link path is a
  numbered spine (decode → run → check → review → hand back → iterate) and
  "The short intent interview" is an unnumbered aside sitting *after* step 3
  has already told the agent to start fixing things. An agent following the
  numbered steps walks straight past it. The starting-from-nothing path does
  make an interview step 1, but it's a *facts* interview — income, spending,
  debts — with intent as one bullet near the bottom, and nothing anywhere
  saying *don't proceed until they've confirmed you got it right*. This is the
  highest-value fix in the round: everything else cost the agent time, this one
  costs the person a plan aimed at the wrong thing.
- **It produced a broken share link twice.** The YAML it handed over was good
  both times; the link wasn't. Asked about it, the agent traced both failures
  precisely, and **the codec was never wrong** — it was how the string was
  presented. First attempt: it wrapped the URL as
  `[truncated-text-with-…](full-url)`. The href was correct, so clicking it
  worked; copying the visible text gave 120 characters that fail `atob`. Second
  attempt: it tried to paste 1,309 characters inline in prose and generated
  literal garbage. What fixed it was a bare URL, on its own line, in a fenced
  code block, with nothing else on it.

  **And the reason it couldn't tell it had failed: the page fails silently.**
  `stateFromShareHash` catches every decode error and returns null, and boot
  loads `example.yaml` instead. So a truncated link doesn't error — it shows
  somebody else's budget. Luke saw the sample plan and assumed the agent had
  handed over the wrong thing. In the agent's own words, making that failure
  loud "would have saved this whole exchange."

**Alongside the fixes: a reduction pass.** Nobody has said "keep it short,
simple, obvious" to this codebase in a while, and it's grown a lint rule, a
check, a comparator, a sweep and a notice dock since anyone looked at it whole.
This round pays some of that back — duplicate helpers merged, one repetitive
block flattened — without inventing an abstraction to do it.

---

## Tasks

### Phase 1 — Ask before you build

`commit: docs: make the intent interview a step, not an aside`

Nothing to implement in the engine. The whole failure is where the words sit:
a numbered procedure beats an unnumbered section every time, because an agent
working through a list works through the list.

- [x] Move "The short intent interview" so it is **step 1** of "You've been
      handed an existing plan", before decoding anything. Renumber the rest
- [x] Make the same interview step 1 of "Starting from nothing" too, ahead of
      the facts-gathering — what they're aiming at shapes which facts matter.
      One section, referenced from both paths; do not write it twice and let
      the two drift
- [x] Add the gate in plain words: **restate what you heard and get an explicit
      yes before you write or change any YAML.** Not "ask and then restate" —
      say don't proceed until they've agreed you've got it right
- [x] Say what to do when they won't be drawn: state the assumption you're
      making, in one line, and carry it into the handover so it's on the record
      rather than buried in your reasoning
- [x] "Two ways you'll arrive here" tells the from-scratch path to interview
      first and says nothing of the sort to the handed-a-link path. Fix that —
      an existing plan is *more* reason to ask what it's for, not less
- [x] Test in `tests/llms-txt.test.ts`: both arrival paths have the interview
      as their first numbered step, and the confirm-before-changing sentence is
      present
- [x] `evals/README.md`: add "interviewed and restated intent, and got a yes,
      before touching the plan" to what passing looks like, and "started
      optimising before asking what it was for" to what failing looks like
- [x] Q (resolve at review): should `check`'s header carry a one-line "have you
      asked them what this plan is for?" — it currently says the equivalent
      only at the very end, on an all-pass run, which is far too late to change
      what the agent does. One line, every run, or noise?

### Phase 2 — Make a broken link impossible to miss

`commit: fix: say when a share link is broken instead of loading the sample`

The loudest bit first, because it's four lines and it's the thing that cost
Luke and the agent an entire exchange. A hash that's present but doesn't
decode is not "no hash" — it's a broken link, and the page currently treats
the two the same and quietly boots the worked example.

- [x] Failing test: a hash that's present and undecodable produces a visible
      error, not a silent fall back to `example.yaml`. An absent hash still
      loads the example with nothing said
- [x] `stateFromShareHash` stops swallowing the failure. Distinguish "no hash"
      from "hash that won't decode" and let boot say which
- [x] The message names the likely cause, because there's only really one:
      "that share link is truncated or corrupt — it's probably been cut short
      somewhere between there and here. Ask for it again as plain text, or
      paste the YAML into Edit as YAML"
- [x] Leave the broken hash in the URL rather than rewriting it away, so the
      person can still hand it back to whoever sent it

### Phase 3 — A link the CLI can make and check

`commit: feat: envelopes link and decode`

The agent had to write a three-line script importing `encodeShareUrl` from the
library, because **there is no way to produce a share URL from the CLI at
all**. Every other step in `llms.txt` is a CLI command; this one drops you into
writing JavaScript against the bundle. Its own words: "the docs push you to the
CLI for everything else, so the gap is surprising."

- [x] Failing test: `link plan.yml` prints a bare URL and nothing else on the
      line, and the URL decodes back to a YAML that `load()`s to the same
      budget that went in
- [x] Failing test: `decode <url>` prints the YAML inside a link, and fails
      loudly on a truncated or mangled one rather than printing rubbish
- [x] `node envelopes-cli.mjs link plan.yml` — prints the share URL, having
      first decoded its own output and compared it to the input. It refuses to
      print a link that doesn't round-trip
- [x] `node envelopes-cli.mjs decode <url>` — the other direction, so an agent
      can self-verify a link it was given or one it just made
- [x] The bare URL goes to stdout on its own; the character count and any
      length warning go to stderr, so `link plan.yml > link.txt` gives a clean
      link and a piped agent can't accidentally paste the commentary
- [x] `runCli` becomes `async` — the share codec is promise-based and there's
      no honest way round it. One keyword, plus `await` at the call sites and
      in the CLI tests
- [x] Bundle smoke check covers `link` and `decode`, since this is a failure
      that only ever happens to people running the downloaded file

### Phase 4 — Say how to hand a link over

`commit: docs: how to present a share link so it survives the trip`

The codec was fine both times. What broke was markdown: a URL used as link
*text* with an ellipsis in it, and 1,309 characters generated inline in a
sentence. `llms.txt` says "hand back a new link" and "if it's too long to paste
comfortably, give them the YAML" — neither of which warns against what actually
went wrong, twice.

- [x] Add the presentation rule, in those words: emit the URL **bare, on its
      own line, in a fenced code block**. Never as markdown link text, never
      abbreviated with an ellipsis, never inline in a sentence
- [x] Say why it matters that hard: a truncated share link is worse than no
      link. Once phase 2 lands the app says so; until then it silently shows
      the sample plan, and either way the person can't tell what they're
      looking at
- [x] Change "give them the YAML instead *if* the URL is too long" to **always
      hand back both**. The YAML survived both times the link didn't; making
      the robust artefact conditional on the convenient one failing is
      backwards
- [x] Replace the `encodeShareUrl` snippet with `link`, and add `decode` as the
      way to check any link before handing it over
- [x] Test in `tests/llms-txt.test.ts` that the presentation rule is present —
      it's the sort of paragraph that gets tidied away later by someone who
      doesn't know what it cost

### Phase 5 — Shorter links survive more transports

`commit: fix: stop writing schema defaults into shared plans`

The agent's plan was full of `rate: 0`, `floor: 0`, `accounts: []` — values the
schema already defaults. So is every link the *app* makes: `stateToYamlText`
dumps `state.accounts` whole and `goalToRaw` always writes `transfers:` and
`accounts:` keys even when empty. That's payload for nothing, and shorter links
survive more transports.

This is the app's own emitter only. Do **not** strip defaults inside the share
codec: it gzips the YAML text verbatim, comments and all, and re-serialising
someone's hand-written file to save bytes would throw their comments away.

- [x] Failing test: a plan whose accounts and goals are all at their defaults
      round-trips through `stateToYamlText` → `parseYamlIntoState` unchanged,
      and its YAML contains no `rate: 0`, `floor: 0` or empty override lists
- [x] Failing test: the same plan's share link is measurably shorter, and
      `load()` gives the identical budget
- [x] An `accountToRaw` beside the existing `transferToRaw`/`goalToRaw`,
      dropping anything equal to its schema default. Drop `transfers: []` and
      `accounts: []` from `goalToRaw` too
- [x] Every default dropped on the way out must be restored on the way in by
      `parseYamlIntoState`. That's the only correctness risk here, so the
      round-trip test is the one that matters
- [x] Q (resolve at review): `AGENT_HEADER` is ~350 characters of comment in
      every single link. It gzips well and it's the thing that stops the next
      agent reimplementing the engine, so it probably earns its place — but
      confirm rather than assume

### Phase 6 — A goal that only needs a date should only need a date

`commit: fix: let a date-triggered goal omit its account, and name the goal when one is wrong`

`load()` validates `budget.account(goal.account)` for *every* goal, so a pure
`by:`/`by_age:` goal must carry an `account` it will never read. The docs say
those fields are ignored; the loader says they're mandatory. The docs are right
about intent, so the loader changes.

The second half is worse than the first: `no such account: undefined` names
neither the goal nor the field. Every reference error in `check()` should name
the thing that holds the bad reference.

- [x] Failing tests first: a goal with only `by:` loads and fires; a goal with
      only `by_age:` loads and fires; a goal with a misspelled `account` throws
      an error naming *that goal*; a transfer with a bad `out_of`/`into` names
      *that transfer*; an account with a bad `offsets` names *that account*
- [x] Failing test: a goal with neither `by`/`by_age` nor `account`+`target`
      throws — it has no trigger at all, and today it silently never fires
- [x] Failing test: `wait_for_both: true` without an account throws, naming
      the goal — it asks to wait for a balance that isn't there
- [x] `Goal.account: string | null` and `Goal.target: number | null`, null when
      the YAML omits them
- [x] Add `Budget.has(name)` and use it throughout `check()` so every message
      is `<kind> '<name>' refers to no such account: <bad>` rather than the
      bare lookup failure
- [x] `simulate.ts`: `debtAccounts` skips a goal with no account;
      `balanceReached` returns false when either field is null; the target-snap
      moves into a small guarded helper so `checkGoals` stays readable
- [x] `llms.txt`: change "they're ignored" to "you can leave them out", and
      show a date-only goal in the Goals block

### Phase 7 — A transfer that never fires is a finding

`commit: feat: report transfers that never fire`

The engine applies a day's transfers *before* it checks that day's goals, and
`onceDay()` deliberately dates an undated `once` override to the day *after*
its goal, for exactly that reason. Write the date yourself and put it on the
goal's own day and it lands in the past the moment it exists. It never fires,
and nothing says so.

Leave the ordering alone — it's deliberate and documented, and shifting it
would move every existing plan's numbers. Detect the outcome instead, which
also catches the wider class: a `once` date before the run starts, a `once`
date past the horizon, an override that introduces a transfer with a schedule
that never comes round.

- [x] Failing test: a goal override introducing `every: once` dated the goal's
      own firing day produces a `transfer-never-fires` finding, and the same
      override with `day` omitted does not
- [x] Failing test: a top-level `once` transfer dated before the run start is
      reported; one dated inside the run is not
- [x] Failing test: an override that *replaces* an existing transfer's fields
      is not reported — the name already moved money
- [x] `run()` collects the names of transfers that fired and returns
      `neverFired: string[]` on `RunResult`. By name, not by object: a
      replacement is a new object under a name that already worked, and
      flagging that would be noise
- [x] New `transfer-never-fires` rule in `lint`, severity `fail`, ordered
      immediately after `goal-never-fires`
- [x] Its `fix` states the actual trap in plain words: a goal's overrides are
      applied *after* that day's transfers have already run, so a `once` date
      on or before the goal's own day is already past — leave `day` off and it
      lands the day after the goal, which is what "when this goal happens"
      means
- [x] `check` grows an "every transfer fires" criterion beside "every goal
      fires"
- [x] `llms.txt`: the rule in the findings table, and the `once`-dating trap in
      the goal-overrides section
- [x] Q (resolve at review): a terminal `exit: true` goal that introduces a
      transfer would be reported, since the run stops that day. Real enough to
      special-case, or leave it — who starts a transfer at end of life?

### Phase 8 — Don't let a three-week window shout

`commit: fix: stop short phases annualising ordinary swing into an alarm`

Two milestones 24 days apart make a 0.066-year phase. Everything per-year gets
multiplied by fifteen. $600 of ordinary timing swing becomes $5,981/yr, which
sails past the $500/yr materiality floor and fails a check — pointing the agent
at the wrong goal, and at a fix that got worse in both directions because it
was never the problem.

Two separate remedies, because there are two separate faults:

**The rule was wrong.** `firstUnusedGrowth` gates on the annualised rate alone,
and that gate is scale-free — dividing by phase length and then comparing
against a per-year floor is the same test at any phase length. It needs a
second gate in *actual dollars*. The right size for that already exists in the
file: line 118's "one month's incoming cash is normal operating swing", used
today only to seed the final phase's allowance. Use the same measure as the
materiality floor and give the idea a name.

**The table was misleading.** `--flows` printed `$248,202/yr in` for a 24-day
window with a straight face. It doesn't need restructuring; it needs to say
what window the rate came from.

- [x] Failing test: a plan whose milestones land ~3 weeks apart, with ordinary
      swing in the clearing account across that gap, produces *no*
      `clearing-account-accumulating` finding
- [x] Failing test: a genuine long-phase leak is still reported — the new gate
      must not be a mute button
- [x] Extract `monthOfThroughput(flow, years)` and use it both at line 118 and
      as the new absolute gate: accumulation counts only when it beats *both*
      its per-year materiality threshold and `max($500, one month of what
      passes through the account)` in real dollars
- [x] `phaseWindow(years)` in `flows.ts`: `"12.4 years"`, or under a year,
      `"24 days"` plus the plain warning that the /yr rates are scaled up from
      that window. One function, used by `formatFlows`, the browser flow table
      and the accumulation finding — so the CLI, the page and the agent cannot
      word it differently
- [x] The `clearing-account-accumulating` detail carries the absolute dollars
      and the window alongside the rate, so a short phase can't be read as a
      per-year leak

### Phase 9 — `--help`, `--start`, and one horizon

`commit: feat: cli --help and --start, sharing the library's window`

`--start` isn't a nicety: without it, `compare before.yml after.yml` run today
and the same pair run tomorrow are different runs, and an agent diffing
variants across a session can't hold the start still. `simulate()` has always
taken it.

While in there: `simulate()` defaults to 40 years, and its doc comment says
"same as the console tool" — which stopped being true in round 2, when the CLI
moved to the page's window (until the youngest person turns 100). So the two
disagree about the *end* as well as the start, and the comment claims
otherwise. One helper, used by both.

- [x] Failing tests: `--help` prints usage and exits 0 without reading a file;
      `--start=2027-01-01` and `--start 2027-01-01` both work; a malformed
      `--start` is rejected with a clear message rather than producing a
      nonsense run; `--start` moves the horizon with it
- [x] Failing test: `simulate(yaml)` and the CLI with no `--start` produce the
      same end date for the same plan
- [x] `parseArgs` handles `--help`/`-h` and `--start` in both spellings. Keep
      it an index loop — one option takes a value, that's all the parser owes
      anyone
- [x] `horizonEnd(birthdays, start)` in `dates.ts`, used by `cli.ts`, `lib.ts`
      and anywhere else recomputing `addDays(start, 365.25 * horizonYears(...))`
- [x] `SimulateOptions.years` still overrides it; fix the stale doc comment
- [x] `llms.txt`: `--help` and `--start` in the command block, and say that the
      run ends when the youngest person turns 100 — not at 40 years

### Phase 10 — Reduction pass

`commit: refactor: merge duplicated helpers and flatten the check criteria`

Behaviour-preserving. Every existing test stays green without being edited; if
a test needs editing, that's a behaviour change and it belongs in a phase
above, not here.

- [x] `report.ts`'s `yearsBetween` and `flows.ts`'s `yearsIn` are the same
      function. One of them, in `dates.ts`, next to `daysBetween`
- [x] `check.ts`'s last five criteria are the same six lines five times. One
      small table and one loop. Drop `settle`'s second parameter while there —
      it has never been read
- [x] `ui/flows.ts` has its own `money()`; export `flows.ts`'s and use it
- [x] Look for other honest duplication and remove it. **No new abstractions,
      no cleverness, no indirection to save three lines.** If the shorter
      version is harder to read, keep the longer one
- [x] Q (resolve at review): `cover()` exists in both `flows.ts` and
      `ui/flows.ts` and renders `Infinity` differently ("never empties" vs
      "—"). Genuinely two presentations, or should the page say what the CLI
      says?

### Phase 11 — Prove it end to end

`commit: test: the round-3 fixes against the published artefact`

- [x] Full suite green in Docker (`make test`), production build green
      (`make build`) — 33 files, 394 tests
- [x] The published bundle smoke check covers `--help`, `--start`, `link` and
      `decode`, because round 2 learned the hard way that the source tree
      passing proves nothing about the file people actually download. It's a
      new `make bundle-check`, and it runs the built `dist/envelopes-cli.mjs`,
      not the source
- [ ] Hand a deliberately truncated link to the built site and confirm it says
      so rather than showing the sample plan. `stateFromShareHash` is covered
      by a unit test, but boot's wiring into `#linkStatus` is not — this one
      needs a real browser
- [x] Re-run the deterministic eval fixtures and regenerate the share link.
      `src/example.yaml` still checks all PASS on first load, the
      needs-balancing fixture still fails on cashflow first, and the eval link
      was regenerated and verified by decoding it back with `decode`
- [ ] Carried over from round 2, still open: run the external cold-agent
      preference-conflict eval. Needs a separate model session; the code and
      instructions are ready
- [ ] Carried over from round 2, still open: run the cold-agent harness eval
      again from cold, several times. One pass is an anecdote

---

## Decisions

- **The interview is a placement problem, not a content problem.** Round 2's
  intent questions are good. They sit after the step that tells the agent to
  start fixing things, so they get walked past. Moving them is the whole fix;
  rewriting them is not.
- **`check`'s text output gets the one-line reminder; `--json` doesn't.** The
  old placement — the equivalent sentence only at the very end of an all-pass
  run — is too late to change what the agent does on the way there. One line
  at the top of `formatCheck`'s output fixes that without turning `check` into
  a lecture: `--json` calls `JSON.stringify(checked)` directly and never calls
  `formatCheck`, so the line only ever reaches a person reading text, never a
  program parsing structure. Every run, pass or fail — a plan that failed
  cashflow needed asking about just as much as one that passed everything.
- **The share codec is not the bug and doesn't change.** Both broken links were
  presentation failures in the handover — a URL used as markdown link text with
  an ellipsis in it, then 1,309 characters generated inline in a sentence. The
  agent diagnosed both itself. `share.ts` stays exactly as it is.
- **Silent fallback is the defect that hid the other two.** A hash that won't
  decode is a broken link, not an absent one, and showing the sample plan
  instead of saying so is why nobody could tell what had gone wrong. Four lines
  in `stateFromShareHash`, and the single highest-value change in this round
  after the interview.
- **Two deviations while building `link`/`decode`, both recorded rather than
  smuggled.** First, `CliArgs` grew a single `verb` field instead of a fifth
  boolean — five booleans can express four states that don't exist, and this
  round is meant to be paying duplication back, not adding to it. Second,
  `share.ts` did change after all: feeding `gunzip` a deliberately truncated
  fragment left the writable side's rejection unhandled, which takes Node down
  *after* the error has already been reported properly. That's not the codec
  being wrong about encoding — it's an error path nothing had ever walked
  before `decode` existed to walk it.
- **Hand back both the YAML and the link, always.** The YAML survived twice
  when the link didn't. Making the robust artefact conditional on the
  convenient one failing is backwards.
- **Shrink the payload in the app's emitter, never in the codec.** The codec
  gzips YAML text verbatim, comments and all. Re-serialising a hand-written
  file to save bytes would silently throw away its comments, which is a worse
  failure than a long URL.
- **`AGENT_HEADER` stays.** Measured rather than assumed: dropping schema
  defaults took the shipped example's share hash from 1342 to 1274 characters
  — the header itself is a small, fixed, highly-compressible slice of that
  (repeated words gzip well), while it's the only thing standing between a
  passing agent and reimplementing the engine from a decoded fragment, which
  is a failure this round already spent a whole phase fixing after the fact.
  Not worth trading back for a few dozen bytes.
- **The engine's transfer-before-goal ordering stays.** A day's transfers fire,
  then that day's goals are checked — which is why `onceDay()` dates an undated
  `once` override to *tomorrow*. Changing it would move the numbers in every
  plan already out there for the sake of one confusing edge. Detect and explain
  instead.
- **`transfer-never-fires` is tracked by name, not by transfer object.** A goal
  override that replaces a transfer creates a new object under an existing
  name; that name has already moved money, and reporting the new object would
  accuse a working plan.
- **Short-phase suppression is a second gate, not a phase-length cutoff.** A
  minimum phase length would be an arbitrary number a genuine three-month leak
  could hide behind. Requiring the accumulation to beat a month of the
  account's own throughput in actual dollars is the same judgement the file
  already makes at line 118, applied consistently.
- **The docs were right and the loader was wrong**, not the other way round. A
  goal triggered by a date has no business naming an account, and requiring one
  invited the agent to name an arbitrary account it then had to reason about.
- **`--start` belongs on the CLI because the library already has it.** Two
  surfaces over one engine disagreeing about the start date is the same defect
  round 2 fixed for the horizon, and it's still half-fixed.
- **One rounding change slipped through the reduction pass, and it stays.**
  Sharing `money()` moved the browser's flow table from `Math.round(v)` to
  `toLocaleString`'s own rounding. They differ on exactly one input — a
  negative value landing precisely on `.5`, where `Math.round` goes toward
  zero and `toLocaleString` goes away from it. A compounded balance never
  lands there, and the CLI's answer is the more defensible one, so it's noted
  rather than reverted.
- **The reduction pass may not change behaviour.** If a test has to change, the
  work isn't reduction and it moves to whichever phase owns the behaviour.
- **`cover()` stays duplicated in `flows.ts` and `ui/flows.ts`, per the plan's
  own recommendation.** "never empties" is a phrase for someone reading a
  terminal table top to bottom; "—" is a phrase for someone reading a column
  of table cells where a whole word would crowd the row. That's the actual
  difference between the two readers, not an accident of two people writing
  the same thing twice. Sharing the *logic* and not the wording would mean a
  function that takes years in and returns "never empties"/"—" behind a flag
  or a lookup table keyed by caller — more moving parts than the four-line
  function it would replace, in each place. Left alone in both places.
- **Found and left alone: `stringifyDay` in `state.ts` and `normalizeDay` in
  `model.ts`.** Same Date-to-string branch, but `normalizeDay` also maps
  `undefined`/`null` to an explicit `null` and `stringifyDay` doesn't — it
  passes them through untyped. Merging would mean either changing what a
  missing transfer day resolves to in the UI path (a behaviour change, out of
  scope for this phase) or keeping two call sites that treat the same shared
  function differently depending on which one calls it, which is worse than
  the duplication it would remove.
- **Found and left alone: `toRowFields` in `ui/goals.ts` and
  `ui/transfers.ts`.** Same name, same `RowFields` shape out, but the logic
  differs on purpose: goals.ts resolves a transfer through zero or more
  earlier goals' overrides before reading its fields; transfers.ts reads a
  base transfer directly, no override to resolve. Routing the simple case
  through the override-resolution one to share the function would be
  indirection for a call site that has nothing to resolve.
- **Removed: `escapeHTML`, byte-for-byte identical in `ui/accounts.ts` and
  `ui/transfer-fields.ts`.** Not one of the three named items, but the same
  kind of thing `remove-button.ts` already exists to solve — a small shared
  UI helper both files import — so it moved to a new `ui/html.ts` alongside
  it rather than staying doubled.
- **`addDays` in `simulate.ts` duplicates `dates.ts`'s own, left alone.**
  Already has its own comment explaining why: a local, tiny copy to avoid
  what its author called "a circular-feeling extra import for one call site."
  That's a decision already made and written down, not an oversight to
  correct in a behaviour-preserving pass.
- **A terminal `exit: true` goal introducing a transfer is left unhandled,
  deliberately.** It's real enough to flag — a transfer introduced the same day
  the run stops genuinely never fires, so `transfer-never-fires` naming it is
  accurate, not a false positive. Special-casing it would be complexity spent
  on an edge nobody writes: a plan that starts a brand new transfer on the day
  it declares life over. If this ever shows up on a real plan, it'll be an
  obvious, cheap-to-read false alarm, not a silent trap — that's an acceptable
  trade against a special case for something this rare.

---

## Out of scope

- Anything about the sweep, the comparator, the notice dock or the flow display
  controls beyond the short-window label. Round 2 shipped those and this round
  isn't relitigating them.
- A general argument parser. One option takes a value; that's the whole
  requirement.
- A preferences schema. The interview stays a conversation the agent holds and
  restates — round 2 decided that deliberately and nothing here changes it.
- Re-opening the deferred round-2 non-goals: the over-saving upper bound, a
  sensitivity solver, the matched-redirect counterfactual, opportunity-cost
  warnings.
- Deploy, share codec internals, infra. `link` and `decode` use `share.ts`
  exactly as it stands — the codec was never the problem.
