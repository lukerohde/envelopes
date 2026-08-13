# envelopes — a harness a fresh agent can actually pass

Implementation brief, phased. Each phase is one commit.

## Objective

**Context:** round 1 made the tool legible to an agent — discovery, a real
engine to run, named findings. Then an agent (me) used that harness to
rebalance the worked example and got it wrong seven times running. Every
defect was caught by Luke's eye on a screenshot, not by the harness. The
tooling said "clean" while the pay account was insolvent eight weeks in.

**What that proved:** the harness reports *problems* well and says nothing
about *goals*. It has feedback and no feedforward. An agent that doesn't
already know what a good plan looks like will optimise against the checks
rather than the plan, which is exactly what happened.

**Design correction:** there is no universal optimum for a household plan.
Earlier retirement, longer funded retirement, earlier home ownership,
accessible cash, tax-efficient super and certainty under policy risk can move
against one another. The engine can calculate those consequences; neither it
nor an agent may invent how the person values them. The harness is a
decision-support loop: elicit intent, enforce hard constraints, compare feasible
variants, explain the trade-offs, and let the person choose.

**The measure of done:** hand a fresh agent a deliberately broken plan, a
person's stated constraints/preferences and `llms.txt`. It repairs the
mechanics, presents the genuine competing variants, asks rather than assumes
where values decide the answer, and returns the option the person chose without
a human catching a hidden failure. Excess cash must be visible without
pretending every detector, model feature and UI treatment is necessary.

**Product principle:** every dollar has two uses: what it buys today, and the
future freedom it could buy if saved. The app exists to make that trade visible
in time — Luke uses it by changing spending and seeing what happens to financial
independence. The family shorthand was "every $1 spent today is $10 you don't
have tomorrow," but the product must not present 10× as a universal fact: the
actual multiplier depends on time and return, and the real output is the change
to milestones and working time. This is not an instruction to minimise life.
Spending remains the person's input; the tool shows the consequence so they can
decide whether the purchase is worth the time.

---

## Tasks

### Phase 1 — Say what good looks like

`commit: docs: state the acceptance criteria for a plan, not just the faults`

Every judgement that mattered in round 1 came out of a conversation and was
written down nowhere. A fresh agent re-derives them and gets them wrong.

- [x] Write the objective into `llms.txt`, above the rules: a plan holds its
      cashflow throughout, the account that eventually gives out is the
      retirement fund and not the everyday one, clearing accounts don't
      trend, envelopes cycle, every goal fires
- [x] **Aim for the eighties, not the horizon.** Inflation eats every super
      balance; surviving to 101 needs either a fortune or spending nobody
      would accept. Say so, and say that where it runs out is the user's
      decision to make
- [x] **Spending is an input, not a tuning knob.** An agent that balances a
      plan by cutting someone's groceries has not balanced anything. Say it
      in those words
- [x] Mechanical criteria are universal; financial objectives are not. Daily
      floors, legal access and internally consistent transitions can be checked.
      Retirement timing, funded longevity, home ownership, liquidity, risk and
      tax preferences must be elicited from the person and restated before an
      agent proposes variants. A 25-year-old saving a deposit does not inherit a
      retiree's "last into the eighties" objective
- [x] Add the short intent interview to `llms.txt`: which outcomes are hard
      constraints; which direction each preference should move; which levers
      the agent may alter; and which uncertainties (market, liquidity, tax or
      policy) the person values enough to prefer certainty over expected return
- [x] Make the agent restate that intent before changing the plan. Do not demand
      numerical weights: a partial ordering and a few minimum/maximum constraints
      are enough to compare useful scenarios

---

### Phase 2 — Make each finding carry its next move

`commit: feat: findings say what to change, not just what's wrong`

`clearing-account-accumulating` tells you money is pooling. It doesn't say
which knob moves it, or what that knob will break — and they are all
coupled, which round 1 discovered by thrashing and recorded nowhere.

- [x] Add a `fix` field to `Finding`: the specific lever, the direction, and
      the finding it's likely to trigger instead
- [x] Document the coupling explicitly. Raising the super contribution to
      soak a surplus makes the plan last longer, which gives the
      retirement-side over-draw more years to pool, so the leak gets
      *bigger*. That is not discoverable by reasoning; it has to be written
- [x] **Order the findings.** A floor breach freezes every downstream
      number, so fixing cashflow first isn't a preference — nothing else is
      real until it holds. The list should be sorted by what to do first

---

### Phase 3 — `envelopes check`

`commit: feat: a plan check that ends in a single next instruction`

`lint` answers "what's wrong". The missing half is "what now".

- [x] `envelopes check plan.yml` — the acceptance criteria as a pass/fail
      list, then the one thing to do next
- [x] Runs at the same horizon as the page, always. Round 1 shipped a
      console tool running 40 years against a page running 55, so an agent
      and its user got different verdicts on the same plan
- [x] `--json` for agents, exit non-zero while anything fails
- [x] `make plan-check FILE=...`
- [x] Delete nothing from `lint`: `check` is `lint` plus ordering, criteria
      and a next step. One rule engine, not two

---

### Phase 4 — Prove it on a plan that's actually broken

`commit: test: a broken plan, and the harness that talks you through it`

The only test that matters. Everything above is a guess until this passes.

- [x] `tests/fixtures/needs-balancing.yml` — one deliberately bad plan
      carrying the real failures: income flat against escalating spending,
      a clearing account with no buffer, a sinking fund that only fills, a
      drawdown sized by guess, a goal that never fires
- [x] Assert `check` reports each fault, in the right order, with a fix
- [x] Assert the fix it names, applied, clears that fault — so the advice is
      known-good rather than plausible
- [x] **The real test:** give a fresh agent the plan and `llms.txt` and
      nothing else. `evals/README.md` is the procedure; the plan travels as
      a share link, the way a real person hands one over
- [x] First run done and scored — see "Runs so far" in `evals/README.md`.
      Six of seven criteria passed, verified by decoding what it handed
      back rather than trusting its account of itself
- [ ] Run it again, from cold, several times. One pass is an anecdote
- [x] Q (resolve at review): how do we run that repeatedly without it being
      a manual chore every time? Recording the transcript of a passing run
      as a regression artefact is one option

**What the first run exposed, both of them harness faults:**

- [x] **`clearing-account-accumulating` is currently unpassable on a plan
      with real headroom.** The agent followed the fix advice, hit the
      caveat that advice carries, and made the pooling worse — 12.3% to
      13.6%. The advice is a dead end and admits it. Phase 5 is the way
      out, which makes phase 5 a blocker on the eval rather than a nicety
- [x] **Nothing catches the opposite of overspending.** `the money lasts`
      passed at "nothing runs out before 101", and the agent had pushed
      savings to $2,200/month to get there. A plan that starves someone at
      45 to leave a balance at 101 has failed them just as surely as one
      that runs dry at 70, and the harness can't see it. Needs an upper
      bound — the mirror of "spending is an input, not a knob"
- [x] Q (resolve at review): what *is* the upper bound? "Dies with more than
      it started with, in real terms" is measurable and probably too crude.
      A retirement fund still growing at 90 is the clearer signal

**Also found by running it:** the published bundle had its own tiny CLI that
understood no arguments, so every command `llms.txt` documents — `check`,
`lint`, `--json`, `--real`, `--flows` — worked from source and failed for
anyone who downloaded the file they were told to download. Fixed in round 1's
branch; the lesson is that the eval has to run the *artefact*, not the repo.

---

### Phase 5 — POC excess cash before choosing a mechanism

`commit: test: compare ways to handle excess cash`

The first eval left a clearing account pooling money and the harness had no
known-good next move. The interrupted follow-up began an `idle-cash` lint rule:
average daily balance multiplied by the gap to the best apparently reachable
return. That is one useful hypothesis, not yet the design. It currently has no
tests, fails the example's existing expectation, and does not account for an
account already offsetting a loan.

There are four separate questions hiding inside "excess cash":

1. **Detection:** is a balance accumulating beyond its job, or merely cycling?
2. **Cost:** is it giving up a meaningful, reachable return elsewhere?
3. **Remedy:** should the plan change a rate/offset, periodically sweep the
   excess, or only ask the person to rebudget it?
4. **Surface:** is this a failing harness criterion, a lint finding, a user
   insight in the flow table/UI, or some combination?

There are also three quantities that must not be averaged into one:

- **flow headroom:** income minus spending over a phase;
- **liquidity reserve:** balance retained so lumpy scheduled outflows never
  take the clearing account below its floor, even when the low point is months
  after the decision; and
- **rebalance cadence:** how long genuine surplus is allowed to accumulate
  before it is redirected.

The underlying optimization is `maximize funding of the declared current goal,
subject to every daily clearing balance staying at or above its floor`. Annual
net flow alone cannot prove that constraint: a plan can have positive annual
cashflow and still be insolvent on the fifth of every month. Opening balance can
carry the timing gap; periodic rebalancing is how some households reset the
surplus without pretending the fixed allocation was exact forever.

We may not need an answer in every layer. POC the candidates, then choose the
smallest combination that gives an agent a known-good next move and gives a
person useful information rather than noise.

#### Option 1 — A ceiling for clearing accounts

An optional `ceiling` would be the upper counterpart to `floor`: the balance
can move around inside that operating band, but crossing the ceiling says cash
has accumulated beyond the account's job. It applies only to `clearing`.
`expense` accounts do not hold money, and a `sinking` fund is supposed to rise
and fall, so applying it to either would manufacture warnings.

For the harness this is strong: `account-above-ceiling`, its first crossing and
the excess are exact, testable facts. For a person it is also legible: "you said
pay only needs $8,000; it reached $14,300." The cost is configuration, and a
bad ceiling gives a precise but wrong answer. POC both a declared ceiling and a
documented rule of thumb for proposing one from the account's pay/bill cycle.
Do not silently turn the rule of thumb into user intent.

The same finding should feed `lint`/`check` and, if it survives the POC, one
small browser warning near the simulation or flow row. Do not build a second UI
calculation.

#### Option 2 — Opportunity cost across places capital can sit

This is broader than clearing-account accumulation. Savings, investments and
loans all offer a return on marginal money: account interest for the first two,
and avoided interest for a loan while principal remains. An offset already
earns the linked loan's effective rate, not merely the account's printed rate.

A cost in dollars per year would let the harness prioritise material choices
and help an agent goal-seek. The simple POC is average movable balance × return
gap. Its advantage is a short, explainable calculation. Its risks are equally
important: it can ignore payoff dates and goal phases, mistake locked or risky
investments for reachable alternatives, ignore tax, and call two unlike risks
interchangeable because one has a higher headline rate.

Therefore the warning may say "this costs about $X/yr; review where it sits"
without prescribing a destination. An automatic recommendation is allowed
only for a demonstrably dominated choice the model can prove, such as cash
already eligible to offset a dearer loan. POC a real-engine counterfactual as
the more accurate alternative and decide whether the extra machinery buys a
materially better answer.

#### Option 3 — Periodic rebaseline of a clearing account

This models the real practice: let a clearing account cover a chosen operating
period, then periodically move only the surplus above its working balance to
the household's current savings or debt focus. It remedies accumulation rather
than merely reporting it.

For the harness it creates a known-good lever when fixed transfers cannot tune
away drift. For a person it matches an understandable annual rebudget. The hard
part is the destination. Inferring it from active transfers is configuration-
free but ambiguous when mortgage repayments, super contributions and several
savings goals are live together. An explicit destination is deterministic but
has to change as goals change; expressing it as a named transfer would let the
existing goal overrides do that without inventing another routing system.

After retirement, blindly sweeping a pay surplus back into the investment that
funded it can hide an oversized drawdown: money leaves the investment, pools in
pay, then returns to the same place. The harness looks tidy and the actual bug
survives. The POC must include this case. It may decide that a systematic
retirement surplus should reduce the drawdown instead, and that rebaselining is
only for genuine residual variance or an explicitly chosen destination.

**Current work:** compare the completed POC evidence and accept or reject the
leading minimal combination below. The uncommitted analytic opportunity-cost
spike in `src/flows.ts`, `src/lint.ts` and `src/simulate.ts` remains
evidence-gathering code, not a rule being implemented. Do not make the existing
example test pass by accepting its new findings.

- [x] Record the three candidate mechanisms from review before developing the
      current `idle-cash` experiment further
- [x] Build synthetic, deterministic POC cases for: genuine low-yield accumulation;
      a normal cycling sinking fund; an account already offsetting a loan; a
      locked or risky investment with a higher headline rate; a financially
      trivial difference; multiple simultaneous savings/debt destinations; and
      an oversized retirement drawdown swept back to its source. Record the
      analytic spike's output against each case before changing its algorithm
- [x] **POC 1 — clearing ceiling:** first crossing, peak excess,
      schema/UI cost, and a rule of thumb an agent can use to propose the value
      without the engine silently choosing it
- [x] **POC 2a — analytic opportunity cost:** average balance × the gap
      to the best genuinely comparable return, expressed as dollars per year.
      Treat loan interest as a return only while debt remains and credit an
      existing offset with that effective rate
- [x] **POC 2b — counterfactual opportunity cost:** make one
      equivalent placement change, rerun, and measure the actual difference.
      This costs more code and runtime but naturally sees offsets, loan payoff
      dates, and goal phases that a headline-rate comparison misses. Define
      "equivalent placement" explicitly so the rerun does not quietly choose
      a risk level, lock-up or tax treatment
- [x] **POC 3 — annual rebaseline:** compare a balance-dependent transfer such as `sweep_above` with
      an account policy such as `rebaseline_to`, inferring the active focus,
      explicitly routing a named sweep through existing goal overrides, and
      making no engine change at all
- [x] **Decision — compare the POC evidence:** decide whether any result belongs in `lint`, the `check` acceptance
      criteria, `--flows`, the browser UI, or more than one of them. One shared
      finding/result must feed every chosen surface. Agent output needs exact
      fields and a next move; user output needs plain language and must not
      imply that a higher return is free of risk or loss of access
- [x] Decide warning semantics. A breached declared ceiling can fail a check;
      a non-dominating opportunity-cost comparison is advisory and must not
      make every diversified or liquidity-conscious plan exit non-zero. Keep
      severity in the shared result so CLI and browser cannot disagree
- [x] Compare the named sweep with a bounded "safe to save" calculation: vary
      only an explicitly named current-focus transfer and find the greatest
      amount for which the real daily run never breaches a clearing floor.
      This is not the general solver deferred from round 1; it is one declared
      lever against one existing invariant. Reject it if the extra runs and
      monotonicity assumptions buy less than the sweep
- [x] Record the decision and why the rejected options are unnecessary; remove
      rejected POC code rather than leaving parallel mechanisms behind

#### POC evidence

All four prototypes were isolated from this branch, tested against synthetic
plans, run through the full Docker suite, and production-built.

| POC | production delta | strongest result | decisive cost |
|---|---:|---|---|
| declared clearing `ceiling` | +133/−14 | exact first crossing, peak and excess; one structured result can serve every surface | adds config and editor/schema surface, still cannot choose a remedy; a nominal ceiling ages with inflation |
| analytic opportunity cost | +141 | costs comparable marginal placement choices and handles existing offsets/capacity | cannot infer earmarking, access, risk, tax or phase-specific intent; not safe as a failing rule |
| engine counterfactual | +97 | highest fidelity for an explicitly declared source, destination and amount; naturally sees offsets and goal timing | does not detect future accumulation and still needs the person to declare equivalence; roughly one full run per candidate |
| named `sweep_above` transfer | +63/−5 | smallest credible engine remedy; reuses schedules and goal overrides to keep destination explicit by phase | optional remedy, not detector or explanation; structured editor and warning surface would add code |

Test code was deliberately larger than production (115–198 lines per POC)
because the value of the exercise was the false-positive evidence. The exact
line counts are comparison evidence, not code-budget targets for the eventual
implementation.

**What the POCs ruled out:** inferring the active savings focus is ambiguous as
soon as debt, ordinary savings and super are all live. An account-level
`rebaseline_to` duplicates scheduling and goal routing already owned by
transfers. A headline-rate winner cannot prove two placements have comparable
risk or access. Sweeping a retirement surplus back to its source can hide an
oversized drawdown.

**Accepted decision:**

1. Keep the existing configuration-free `clearing-account-accumulating`
   detector instead of adding `ceiling`; improve its next instruction and feed
   the same finding to any browser warning. Accept that it is a rule of thumb,
   not a user-declared constraint.
2. If annual rebudgeting must be represented inside the projection, ship only
   a named `sweep_above` transfer. The person declares the buffer, cadence and
   destination; existing goal overrides change that destination by phase. Do
   not infer financial priority.
3. Reject both opportunity-cost implementations as automatic warnings for now.
   Preserve their useful cases as design evidence, then delete the POC code.
   A higher return can be mentioned as a review principle in `llms.txt`, but
   not presented as a recommendation the model cannot justify.
4. Surface the product principle using the real simulator: a change the person
   makes produces exact before/after milestone movement. POC clearer copy and
   that delta before adding a generalized sensitivity engine.

#### Agent harness recommendation

Keep one source of deterministic feedback: `checkPlan`, exposed as human text
and JSON. The browser consumes the same structured result; it does not grow a
parallel warning system.

Feedback has three meanings: `FAIL` for a mechanically impossible or internally
inconsistent plan, `REVIEW` for a valid choice that depends on the person's
preferences, and `PASS`. Fix every `FAIL` before comparing downstream outcomes;
never silently resolve a `REVIEW`. `saving-below-inflation` becomes review, not
failure: low return may deliberately buy access or certainty. Accumulation in
an account declared `clearing` remains a structural failure because that kind
says the money passes through; if holding it is intentional, give it a savings
job and then review the yield trade-off honestly.

The ordered loop is:

1. Ask for intent: hard constraints, desired directions, allowed levers and
   preferences where the model cannot price certainty, access or policy risk.
2. Run the baseline and fix the first daily floor breach. Nothing downstream is
   real yet. Then fix unreachable transitions and illegal early drawdown.
3. For each goal-delimited phase, resolve clearing accumulation. If systematic
   retirement drawdown exceeds spending, reduce the drawdown; do not hide it
   with a sweep. Otherwise route genuine residual surplus to the explicitly
   declared current focus.
4. Add a named periodic `sweep_above` only when the plan represents that real
   rebudget practice. Start with the person's retained working balance, run the
   real engine, and adjust that one value until the daily floor holds. An agent
   can bisect variants itself; the product does not need a solver.
5. Produce a small set of one-change variants and compare their whole outcome
   vectors. Do not collapse them into one score. Discard an option only when it
   is no worse on every declared outcome and introduces no unmodelled risk.
6. Show the remaining trade-offs and ask the person which one expresses their
   intent. Apply that choice, rerun the check, and hand back the plan.

`clearing-account-accumulating` should carry phase, account, accumulation rate
and peak evidence so both an agent and a person can see where it begins. Its fix
branches explicitly: reduce a mismatched drawdown, or rebaseline genuine
surplus. The prompt teaches the distinction; deterministic fixtures prove both
branches. A sweep back into the investment currently funding the clearing
account is invalid because it launders a drawdown error into a tidy balance.

Opportunity cost remains a prompt principle: review accessible low-yield cash
against debt and savings alternatives, ask about access/risk/tax, and never
infer the winner. It is not a lint rule, check failure or optimizer.

Add one neutral comparison tool shared by agents and the browser. A pure
`compareOutcomes(before, after)` reports named milestone movement, fixed
date/age goals that cannot move, first floor-breach movement, retirement-fund
exhaustion, lowest clearing margin and unallocated surplus by phase. A CLI
`compare before.yml after.yml --json` runs both real plans and prints that same
structure. It never labels earlier/later or more/less as better/worse. This is
the tool an agent uses to build a trade-off table instead of doing date
arithmetic in its prompt.

#### Engine recommendation

Add `sweep_above` to a normal named transfer, mutually exclusive with a fixed
`amount`. On its schedule it moves `max(0, source balance - retained balance)`.
The retained balance escalates like other nominal transfer amounts; below it,
the sweep does nothing and never tops the account up. The source must be
`clearing`, destination is explicit, and loan destinations cap at remaining
principal. Fixed transfers on that day run before the sweep. Existing goal
overrides redirect or stop the named transfer at transitions, so no second
routing or phase system is introduced.

Do not add `ceiling`, `rebaseline_to`, inferred focus, analytic opportunity
cost, counterfactual opportunity cost, or a general/bounded solver in this
round. They either duplicate an existing concept or make a financial choice
the config has not declared.

#### UI recommendation

Add one compact plan-status warning fed by `checkPlan`. It shows the first
actionable issue and links the person to the affected account/phase. Warnings
and agent feedback therefore agree word-for-word and number-for-number.

On a committed numeric edit, retain the prior valid outcome, rerun, and show a
non-modal transient impact message from `compareOutcomes`. Show competing
movement together rather than selecting a winner, for example `Early retirement
47 days earlier · mortgage paid off 8 months later · money lasts 14 months
less`. A fixed date/age transition can be labelled `unchanged — fixed at age
60` when it is relevant to the comparison.

Never show a delta past a floor breach. If no milestone moves because surplus
pools, say that. Initial load, YAML/share replacement, structural rename and a
half-typed number establish or await a baseline without producing a message.
The chart may continue updating on input; impact feedback waits for a committed
change so it does not chatter while somebody types.

With a configured sweep, reducing spending automatically leaves more for the
declared focus at the next rebalance, so the actual plan's milestone moves and
the message needs no hypothetical optimizer. Without one, the UI can later POC
the conditional matched redirect (`If you save the $100/month you freed…`), but
that is second choice: ship the actual-result delta first and add the
counterfactual only if real use shows a gap.

The UI reports consequences and can ask `Is this the direction you intended?`;
it does not store or infer a utility function. Scenario selection and the richer
conversation about home certainty, super policy risk and liquidity belong with
the person and their agent. Do not add a preferences schema in this round unless
the eval proves that an agent cannot reliably retain the stated intent.

### Phase 6 — Implement only the chosen excess-cash path

`commit: feat: make excess cash actionable`

- [x] Write the failing acceptance tests first, based on the Phase 5 decision
- [x] Implement the chosen detector/remedy/surface without a second calculation
      that can drift from the harness
- [x] Make the recommended next move clear about what it improves and what it
      can make worse
- [x] Apply the chosen behaviour to `src/example.yaml` only if the decision
      requires it, and deliberately regenerate the snapshot if numbers move
- [x] Document only the shipped mechanism in `llms.txt`

### Phase 7 — Make the present/future trade visible

`commit: feat: show spending in future freedom`

**Desired interaction:** Luke changes a spending number, the existing debounced
simulation reruns, and a transient message says `Early retirement delayed 47
days`. This is not a separate forecast: compare the previous valid run's
completed-goal dates with the new run, matched by the goal's own name. That name
supplies "retirement" where the plan means retirement, so the schema does not
need another classification.

The interaction depends on deliberate routing at each transition. If reducing
spending merely adds to a clearing-account balance, no goal moves and the page
hides the future value of the change. The accumulation detector and optional
named sweep are therefore not tidiness features: they make marginal changes
flow into the currently declared goal, which makes their time consequence
observable.

Candidate messages, all derived from exact run results:

- `Early retirement delayed 47 days`
- `Mortgage paid off 12 days earlier`
- `Super access is no longer reached`
- `No milestone moved — the extra cash is accumulating in pay`

Never compare or quote a milestone after the first floor breach. That date is
fictional even though the engine continues drawing the chart. If either the old
or new plan breaks before the affected transition, explain that the comparison
cannot be made until cashflow holds. A date- or age-triggered retirement goal is
fixed by definition and may not move when spending changes; report the exact
milestone or plan-end consequence that did move rather than forcing the word
"retirement" into the message.

There is a simpler, conditional version when the edit reduces a scheduled
expense. For an impact experiment, redirect exactly the freed amount from the
same source on the same dates to an explicitly declared current focus. The
clearing-account path is then unchanged from the valid baseline, so the
experiment cannot create a new timing low. Its wording must stay conditional —
`If you save the $100/month you freed, Early retirement moves 47 days earlier`
— because the edit alone has not actually allocated the money. This solves the
uncle's present-versus-future question without pretending it also solves
pre-existing unallocated surplus.

- [x] Decide whether the upper bound is universal or declared by the plan
- [x] POC the measurable candidate from the first eval: a retirement fund
      still growing in real terms at 90, rather than merely surviving to the
      chart horizon
- [x] Add a deterministic fixture that starves the present to leave excessive
      money late, without changing the person's declared spending
- [x] Give the harness a next move that cannot silently turn spending into a
      tuning knob
- [x] Compare the smallest ways to surface the product principle: clearer copy
      around the existing live edit/resimulate loop; before/after milestone
      deltas for a change the person actually made; and a marginal sensitivity
      such as "$100/month changes milestone X by Y"
- [x] POC the immediate previous-run delta first: stable goal-name matching,
      exact calendar-day difference, earlier/later wording, newly reached/no
      longer reached, and no toast on initial load
- [x] Write `compareOutcomes` as a pure, deterministic result before wiring any
      presentation. Cover milestone dates, fixed transitions, first breach,
      funded longevity, clearing low margin and phase surplus; no qualitative
      score or winner field
- [x] Use the same comparator for `compare before.yml after.yml --json` and the
      browser edit message. Prove the two surfaces return identical facts
- [x] POC the matched-redirect experiment for a reduced scheduled expense:
      same source, cadence, day and escalation; amount limited to exactly what
      the edit freed; destination explicit or uniquely unambiguous. Prove the
      clearing balance path is unchanged, then compare its transition dates
- [x] If several savings/debt focuses are live, ask or omit the conditional
      estimate. Do not pick the highest rate, largest contribution or first
      account in config order
- [x] Decide which edits establish a new baseline without producing a message
      (loading YAML/share links and structural renames are the obvious cases),
      so a half-typed number or renamed goal does not generate nonsense
- [x] When no valid milestone moves, distinguish genuinely no measured effect
      from money diverted into an accumulating clearing account. Reuse the
      shared finding; do not infer this separately in the UI
- [x] Suppress downstream deltas when either run breaches a floor before that
      milestone, using the same breach result as `check`
- [x] Do not invent a universal "financial independence" date. If a config has
      no declared goal that means retirement, report exact milestone changes
      rather than guessing which one is independence
- [x] Prefer explanation over a new feature if the existing simulator already
      makes the trade visible once the page tells the person what to look for
- [x] Add flow-table display controls for future/today dollars and
      weekly/fortnightly/monthly/yearly rates; keep the simulator's annual
      facts as the single source and leave balances/closing amounts unscaled
- [x] Add a compact transfer-mode selector for fixed amount versus
      `sweep_above`, reused in goal overrides and disabled unless the source
      account is clearing
- [x] Keep the shared plan warning and edit-impact feedback in a responsive
      fixed bottom notice dock so the consequence remains visible while the
      person scrolls between an edit and its milestones
- [x] Make a newly added transfer's sweep mode become available as soon as its
      source is chosen, and make `external income` an explicit From choice;
      unknown account names can be added directly from the Transfers picker
- [x] Add an eval whose preferences genuinely conflict: earlier retirement,
      longer funded retirement, home ownership certainty, accessible savings
      and super tax treatment. Passing means the agent offers alternatives and
      asks; choosing a single rate-maximising answer without eliciting intent
      fails

**Round-2 scope note:** the upper-bound/over-saving detector, a general
sensitivity solver, and the matched-redirect counterfactual remain explicitly
deferred. The accepted design treats spending as the person's input and uses
the real before/after run plus a named sweep to make the consequence visible;
it does not invent a universal amount of money someone ought to spend or save.
The conflicting-preferences eval is now specified in `llms.txt` and remains an
external cold-agent verification task, not a new preference schema or a
rate-maximising test oracle.

The Phase-4 fixture assertions now cover its observable findings and fixes;
the accumulation branch has a deterministic `sweep_above` acceptance case.
The upper-bound question is recorded as a deliberate non-goal rather than
silently turning spending into a tunable variable.

### Round-2 implementation closeout

The accepted slice is now implemented on `agent-harness-round-2`:

- `Finding.severity` distinguishes mechanical `FAIL` from preference-dependent
  `REVIEW`; `checkPlan` carries the same status and `lint` exits non-zero only
  for failures. The shared result is what the CLI and browser read.
- `sweep_above` is a normal named transfer. It retains an explicitly declared,
  inflation-aware clearing balance, moves only the excess on schedule, caps a
  loan destination, and inherits the existing goal override routing. YAML/UI
  round-tripping preserves it without adding a second parser.
- `compareOutcomes` is pure and neutral. It reports milestone dates and day
  deltas, fixed transitions, first floor breach, retirement exhaustion, lowest
  clearing margins and phase surplus. `compare before.yml after.yml --json`
  and the browser edit status use that same result. The browser establishes a
  baseline on load/import and shows a non-modal message only after a committed
  edit; no milestone is quoted past a floor breach.
- `llms.txt` now gives the intent interview, the competing-goal loop, the
  present/future-dollar framing, severity semantics and the explicit sweep.

Verification: the full Docker test suite passes (33 files, 301 tests) after
the round-2 additions and the production build/typecheck passes. The published
CLI bundle also has a smoke check for `check --json` and `compare --json` so an
agent receives one JSON document rather than the duplicate output that a
bundled direct-entry guard would otherwise produce. The external cold-agent
preference-conflict eval remains the only follow-up requiring a separate model
session; it is intentionally not hidden as a deterministic unit test.

### Phase 8 — Re-run the real eval

`commit: test: repeat the cold-agent harness eval`

- [x] Run the published artefact's deterministic smoke checks several times,
      not only the source tree
- [x] Score the implemented severity, excess-cash remedy and outcome comparison
      alongside the existing criteria
- [x] Record enough evidence to reproduce the verdict without treating one
      transcript as a deterministic unit test
- [x] Mark the example's declared end of life with a terminal `Old & broke`
      goal at super $1,000, so intentional retirement exhaustion is not an
      out-of-box floor failure
- [ ] Run the external cold-agent preference-conflict eval. It requires a
      separate model/session; the code and instructions are ready for it.

---

## Decisions

- An engine `Goal` is a transition trigger, not proof that moving its date in
  one direction is the person's objective. Age/date goals may be fixed
  constraints; balance goals may be levers or milestones. User intent lives in
  the planning conversation unless repeated evals prove it must be persisted.
- The agent facilitates a decision rather than maximizing a scalar score. Its
  required tools are `check` for mechanical feasibility and a neutral shared
  comparator for consequences. Its required instructions are intent elicitation,
  one-change variants, trade-off presentation and asking before choosing.
- Low yield is not itself a defect. Cash may deliberately buy access, certainty
  or protection from risks the engine does not model. Unallocated accumulation
  in an account declared `clearing` remains a structural finding; once the
  person gives that cash a deliberate job, the harness must respect the choice.
- Phases 1–3 and the first Phase 4 eval landed on round 1's branch because the
  eval immediately exercised the harness it was reviewing. Round 2 starts from
  that commit rather than rewriting history to manufacture a clean boundary.
- The interrupted `idle-cash` implementation was rejected and removed. It was
  not made green by merely updating the example's expected findings.
- Excess-cash detection, a model remedy, a harness criterion and a browser
  presentation are separate choices. Phase 5 decides which are actually
  needed before Phase 6 implements any of them.
- Prefer no new configuration when the engine can infer a fact. Require an
  explicit value when inference would choose the person's liquidity buffer,
  investment risk, access to money or savings priority. Determinism outranks a
  configuration-free guess.
- `expense` and `sinking` accounts are excluded from clearing-account ceilings.
  Opportunity-cost comparisons concern capital-bearing savings, investments
  and loans; a clearing account's excess can participate only after its working
  buffer has been separated from the movable amount.
- A costed opportunity warning may prioritise a review without recommending a
  destination. Higher headline return alone does not prove that money is
  movable or that two accounts have comparable risk, access or tax treatment.
- The existing all-findings-are-failures contract is not automatically suitable
  for opportunity cost. The POC must distinguish a violated declared constraint
  from an advisory comparison before adding it to `lint` or `check`.
- Rebaselining must not turn an oversized retirement drawdown into a passing
  result by sweeping the surplus back to its source. Fixing the drawdown is the
  first candidate in that phase.
- The uncle's 10× rule is the product's framing, not a hard-coded multiplier.
  Engine output must use the plan's actual dates, returns and milestones. The
  wording should express agency and future freedom, not shame present spending.
- The eval always tests the built downloadable artefact. Source-only success
  does not count.

---

## Out of scope

- A general solver that tunes arbitrary variables against arbitrary
  constraints. The POC compares bounded, explainable alternatives only.
- Publishing a bundle SHA-256 or adding an MCP server; both were deferred from
  round 1 and do not answer the harness failures.
- Anything about the deploy, the share codec, or discovery. Round 1 covered
  those and nothing here touches them.
