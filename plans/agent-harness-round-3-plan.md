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
  both times; the link wasn't. We don't know which link failure it was, and
  guessing is how you fix the wrong one — so this starts by reproducing it. But
  either way the shape of the answer is the same: handing back a link is
  currently the one step in the whole procedure with no way to check its own
  work. Everything else in this tool can be run and verified. A link is written
  by hand in a snippet, printed, and pasted, and nothing ever decodes it again
  to see whether it survived.

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

- [ ] Move "The short intent interview" so it is **step 1** of "You've been
      handed an existing plan", before decoding anything. Renumber the rest
- [ ] Make the same interview step 1 of "Starting from nothing" too, ahead of
      the facts-gathering — what they're aiming at shapes which facts matter.
      One section, referenced from both paths; do not write it twice and let
      the two drift
- [ ] Add the gate in plain words: **restate what you heard and get an explicit
      yes before you write or change any YAML.** Not "ask and then restate" —
      say don't proceed until they've agreed you've got it right
- [ ] Say what to do when they won't be drawn: state the assumption you're
      making, in one line, and carry it into the handover so it's on the record
      rather than buried in your reasoning
- [ ] "Two ways you'll arrive here" tells the from-scratch path to interview
      first and says nothing of the sort to the handed-a-link path. Fix that —
      an existing plan is *more* reason to ask what it's for, not less
- [ ] Test in `tests/llms-txt.test.ts`: both arrival paths have the interview
      as their first numbered step, and the confirm-before-changing sentence is
      present
- [ ] `evals/README.md`: add "interviewed and restated intent, and got a yes,
      before touching the plan" to what passing looks like, and "started
      optimising before asking what it was for" to what failing looks like
- [ ] Q (resolve at review): should `check`'s header carry a one-line "have you
      asked them what this plan is for?" — it currently says the equivalent
      only at the very end, on an all-pass run, which is far too late to change
      what the agent does. One line, every run, or noise?

### Phase 2 — A link you can trust

`commit: feat: envelopes link, so a share link is checked before it is handed over`

The agent handed Luke a broken link twice and good YAML both times. Encoding a
link is the only step in the procedure the tool doesn't do for you: `llms.txt`
prints a four-line JS snippet and wishes you luck. Then a 3,000-character URL
crosses a chat window, and nobody ever decodes it to see whether what arrived
is what left.

**Reproduce before fixing.** There are at least four candidates and they have
different answers: a hand-rolled codec despite the warning; the snippet run
against a stale or partial YAML file; `CompressionStream` behaving differently
in the agent's Node than in the browser; or the URL simply being mangled by the
chat client that carried it. Find out which before writing code for it.

- [ ] Reproduce it first. Run the published bundle's `encodeShareUrl` under
      Node 18/20/22 against `src/example.yaml` and a long real plan, decode
      each result back, and diff. Record what you find in this plan's
      Decisions — including "couldn't reproduce", which is itself the answer
      that says the failure is in the handover, not the codec
- [ ] Failing test: `link` round-trips a config — encode, decode, and the YAML
      that comes back `load()`s to the same budget as the YAML that went in
- [ ] Failing test: `link --check <url>` prints the YAML inside a link, and
      fails loudly on a truncated or mangled one rather than printing rubbish
- [ ] `node envelopes-cli.mjs link plan.yml` — prints the share URL, having
      first decoded its own output and compared it to the input. It refuses to
      print a link that doesn't round-trip. An agent cannot hand over a broken
      link by accident, which is the entire point
- [ ] It also prints the character count, and warns above ~2,000 that the URL
      is long enough for a chat client to break, so hand back the YAML as well
- [ ] `runCli` becomes `async` — the share codec is promise-based and there's
      no honest way round it. One keyword, plus `await` at the call sites and
      in the CLI tests
- [ ] `llms.txt`: replace the encode snippet with `link`. And change "give them
      the YAML instead *if* the URL is too long" to **always hand back both** —
      the YAML is the artefact that survives, the link is the convenience
- [ ] `llms.txt`: never hand over a link you haven't decoded and read back.
      `link` does it for you; if you built one another way, check it yourself
- [ ] Bundle smoke check covers `link` and `link --check`, since this is a
      failure that only ever happens to people running the downloaded file

### Phase 3 — A goal that only needs a date should only need a date

`commit: fix: let a date-triggered goal omit its account, and name the goal when one is wrong`

`load()` validates `budget.account(goal.account)` for *every* goal, so a pure
`by:`/`by_age:` goal must carry an `account` it will never read. The docs say
those fields are ignored; the loader says they're mandatory. The docs are right
about intent, so the loader changes.

The second half is worse than the first: `no such account: undefined` names
neither the goal nor the field. Every reference error in `check()` should name
the thing that holds the bad reference.

- [ ] Failing tests first: a goal with only `by:` loads and fires; a goal with
      only `by_age:` loads and fires; a goal with a misspelled `account` throws
      an error naming *that goal*; a transfer with a bad `out_of`/`into` names
      *that transfer*; an account with a bad `offsets` names *that account*
- [ ] Failing test: a goal with neither `by`/`by_age` nor `account`+`target`
      throws — it has no trigger at all, and today it silently never fires
- [ ] Failing test: `wait_for_both: true` without an account throws, naming
      the goal — it asks to wait for a balance that isn't there
- [ ] `Goal.account: string | null` and `Goal.target: number | null`, null when
      the YAML omits them
- [ ] Add `Budget.has(name)` and use it throughout `check()` so every message
      is `<kind> '<name>' refers to no such account: <bad>` rather than the
      bare lookup failure
- [ ] `simulate.ts`: `debtAccounts` skips a goal with no account;
      `balanceReached` returns false when either field is null; the target-snap
      moves into a small guarded helper so `checkGoals` stays readable
- [ ] `llms.txt`: change "they're ignored" to "you can leave them out", and
      show a date-only goal in the Goals block

### Phase 4 — A transfer that never fires is a finding

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

- [ ] Failing test: a goal override introducing `every: once` dated the goal's
      own firing day produces a `transfer-never-fires` finding, and the same
      override with `day` omitted does not
- [ ] Failing test: a top-level `once` transfer dated before the run start is
      reported; one dated inside the run is not
- [ ] Failing test: an override that *replaces* an existing transfer's fields
      is not reported — the name already moved money
- [ ] `run()` collects the names of transfers that fired and returns
      `neverFired: string[]` on `RunResult`. By name, not by object: a
      replacement is a new object under a name that already worked, and
      flagging that would be noise
- [ ] New `transfer-never-fires` rule in `lint`, severity `fail`, ordered
      immediately after `goal-never-fires`
- [ ] Its `fix` states the actual trap in plain words: a goal's overrides are
      applied *after* that day's transfers have already run, so a `once` date
      on or before the goal's own day is already past — leave `day` off and it
      lands the day after the goal, which is what "when this goal happens"
      means
- [ ] `check` grows an "every transfer fires" criterion beside "every goal
      fires"
- [ ] `llms.txt`: the rule in the findings table, and the `once`-dating trap in
      the goal-overrides section
- [ ] Q (resolve at review): a terminal `exit: true` goal that introduces a
      transfer would be reported, since the run stops that day. Real enough to
      special-case, or leave it — who starts a transfer at end of life?

### Phase 5 — Don't let a three-week window shout

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

- [ ] Failing test: a plan whose milestones land ~3 weeks apart, with ordinary
      swing in the clearing account across that gap, produces *no*
      `clearing-account-accumulating` finding
- [ ] Failing test: a genuine long-phase leak is still reported — the new gate
      must not be a mute button
- [ ] Extract `monthOfThroughput(flow, years)` and use it both at line 118 and
      as the new absolute gate: accumulation counts only when it beats *both*
      its per-year materiality threshold and `max($500, one month of what
      passes through the account)` in real dollars
- [ ] `phaseWindow(years)` in `flows.ts`: `"12.4 years"`, or under a year,
      `"24 days"` plus the plain warning that the /yr rates are scaled up from
      that window. One function, used by `formatFlows`, the browser flow table
      and the accumulation finding — so the CLI, the page and the agent cannot
      word it differently
- [ ] The `clearing-account-accumulating` detail carries the absolute dollars
      and the window alongside the rate, so a short phase can't be read as a
      per-year leak

### Phase 6 — `--help`, `--start`, and one horizon

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

- [ ] Failing tests: `--help` prints usage and exits 0 without reading a file;
      `--start=2027-01-01` and `--start 2027-01-01` both work; a malformed
      `--start` is rejected with a clear message rather than producing a
      nonsense run; `--start` moves the horizon with it
- [ ] Failing test: `simulate(yaml)` and the CLI with no `--start` produce the
      same end date for the same plan
- [ ] `parseArgs` handles `--help`/`-h` and `--start` in both spellings. Keep
      it an index loop — one option takes a value, that's all the parser owes
      anyone
- [ ] `horizonEnd(birthdays, start)` in `dates.ts`, used by `cli.ts`, `lib.ts`
      and anywhere else recomputing `addDays(start, 365.25 * horizonYears(...))`
- [ ] `SimulateOptions.years` still overrides it; fix the stale doc comment
- [ ] `llms.txt`: `--help` and `--start` in the command block, and say that the
      run ends when the youngest person turns 100 — not at 40 years

### Phase 7 — Reduction pass

`commit: refactor: merge duplicated helpers and flatten the check criteria`

Behaviour-preserving. Every existing test stays green without being edited; if
a test needs editing, that's a behaviour change and it belongs in a phase
above, not here.

- [ ] `report.ts`'s `yearsBetween` and `flows.ts`'s `yearsIn` are the same
      function. One of them, in `dates.ts`, next to `daysBetween`
- [ ] `check.ts`'s last five criteria are the same six lines five times. One
      small table and one loop. Drop `settle`'s second parameter while there —
      it has never been read
- [ ] `ui/flows.ts` has its own `money()`; export `flows.ts`'s and use it
- [ ] Look for other honest duplication and remove it. **No new abstractions,
      no cleverness, no indirection to save three lines.** If the shorter
      version is harder to read, keep the longer one
- [ ] Q (resolve at review): `cover()` exists in both `flows.ts` and
      `ui/flows.ts` and renders `Infinity` differently ("never empties" vs
      "—"). Genuinely two presentations, or should the page say what the CLI
      says?

### Phase 8 — Prove it end to end

`commit: test: the round-3 fixes against the published artefact`

- [ ] Full suite green in Docker (`make test`), production build green
      (`make build`)
- [ ] The published bundle smoke check covers `--help`, `--start` and `link`,
      because round 2 learned the hard way that the source tree passing proves
      nothing about the file people actually download
- [ ] Re-run the deterministic eval fixtures and regenerate the share link if
      the plan's numbers moved
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
- **Reproduce the broken link before designing for it.** Four plausible causes
  with four different answers. The round-trip-checked `link` verb is worth
  having regardless — it turns the one unverifiable step into a verifiable one
  — but which *other* fix ships depends on what the reproduction shows.
- **Hand back both the YAML and the link, always.** The YAML survived twice
  when the link didn't. Making the robust artefact conditional on the
  convenient one failing is backwards.
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
- **The reduction pass may not change behaviour.** If a test has to change, the
  work isn't reduction and it moves to whichever phase owns the behaviour.

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
- Deploy, share codec internals, infra. `link` uses `share.ts` exactly as it
  stands unless the reproduction in Phase 2 proves otherwise.
