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

**The measure of done:** hand a fresh agent a deliberately broken plan and
`llms.txt`, and it balances it without a human catching anything. The answer
must also make excess cash visible in the right place — to the harness, and
possibly to the person using the site — without pretending every possible
detector, model feature and UI treatment is necessary.

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
- [ ] Q (resolve at review): are these criteria universal, or does a plan
      need to declare its own? A 25-year-old saving a house deposit has a
      different shape and "runs out in the eighties" is meaningless for them

---

### Phase 2 — Make each finding carry its next move

`commit: feat: findings say what to change, not just what's wrong`

`clearing-account-accumulating` tells you money is pooling. It doesn't say
which knob moves it, or what that knob will break — and they are all
coupled, which round 1 discovered by thrashing and recorded nowhere.

- [x] Add a `fix` field to `Finding`: the specific lever, the direction, and
      the finding it's likely to trigger instead
- [ ] Document the coupling explicitly. Raising the super contribution to
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
- [ ] Assert `check` reports each fault, in the right order, with a fix
- [ ] Assert the fix it names, applied, clears that fault — so the advice is
      known-good rather than plausible
- [x] **The real test:** give a fresh agent the plan and `llms.txt` and
      nothing else. `evals/README.md` is the procedure; the plan travels as
      a share link, the way a real person hands one over
- [x] First run done and scored — see "Runs so far" in `evals/README.md`.
      Six of seven criteria passed, verified by decoding what it handed
      back rather than trusting its account of itself
- [ ] Run it again, from cold, several times. One pass is an anecdote
- [ ] Q (resolve at review): how do we run that repeatedly without it being
      a manual chore every time? Recording the transcript of a passing run
      as a regression artefact is one option

**What the first run exposed, both of them harness faults:**

- [ ] **`clearing-account-accumulating` is currently unpassable on a plan
      with real headroom.** The agent followed the fix advice, hit the
      caveat that advice carries, and made the pooling worse — 12.3% to
      13.6%. The advice is a dead end and admits it. Phase 5 is the way
      out, which makes phase 5 a blocker on the eval rather than a nicety
- [ ] **Nothing catches the opposite of overspending.** `the money lasts`
      passed at "nothing runs out before 101", and the agent had pushed
      savings to $2,200/month to get there. A plan that starves someone at
      45 to leave a balance at 101 has failed them just as surely as one
      that runs dry at 70, and the harness can't see it. Needs an upper
      bound — the mirror of "spending is an input, not a knob"
- [ ] Q (resolve at review): what *is* the upper bound? "Dies with more than
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
- [ ] **Decision — compare the POC evidence:** decide whether any result belongs in `lint`, the `check` acceptance
      criteria, `--flows`, the browser UI, or more than one of them. One shared
      finding/result must feed every chosen surface. Agent output needs exact
      fields and a next move; user output needs plain language and must not
      imply that a higher return is free of risk or loss of access
- [ ] Decide warning semantics. A breached declared ceiling can fail a check;
      a non-dominating opportunity-cost comparison is advisory and must not
      make every diversified or liquidity-conscious plan exit non-zero. Keep
      severity in the shared result so CLI and browser cannot disagree
- [ ] Compare the named sweep with a bounded "safe to save" calculation: vary
      only an explicitly named current-focus transfer and find the greatest
      amount for which the real daily run never breaches a clearing floor.
      This is not the general solver deferred from round 1; it is one declared
      lever against one existing invariant. Reject it if the extra runs and
      monotonicity assumptions buy less than the sweep
- [ ] Record the decision and why the rejected options are unnecessary; remove
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

**Leading minimal combination — pending Luke's decision:**

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

### Phase 6 — Implement only the chosen excess-cash path

`commit: feat: make excess cash actionable`

- [ ] Write the failing acceptance tests first, based on the Phase 5 decision
- [ ] Implement the chosen detector/remedy/surface without a second calculation
      that can drift from the harness
- [ ] Make the recommended next move clear about what it improves and what it
      can make worse
- [ ] Apply the chosen behaviour to `src/example.yaml` only if the decision
      requires it, and deliberately regenerate the snapshot if numbers move
- [ ] Document only the shipped mechanism in `llms.txt`

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

- [ ] Decide whether the upper bound is universal or declared by the plan
- [ ] POC the measurable candidate from the first eval: a retirement fund
      still growing in real terms at 90, rather than merely surviving to the
      chart horizon
- [ ] Add a deterministic fixture that starves the present to leave excessive
      money late, without changing the person's declared spending
- [ ] Give the harness a next move that cannot silently turn spending into a
      tuning knob
- [ ] Compare the smallest ways to surface the product principle: clearer copy
      around the existing live edit/resimulate loop; before/after milestone
      deltas for a change the person actually made; and a marginal sensitivity
      such as "$100/month changes milestone X by Y"
- [ ] POC the immediate previous-run delta first: stable goal-name matching,
      exact calendar-day difference, earlier/later wording, newly reached/no
      longer reached, and no toast on initial load
- [ ] POC the matched-redirect experiment for a reduced scheduled expense:
      same source, cadence, day and escalation; amount limited to exactly what
      the edit freed; destination explicit or uniquely unambiguous. Prove the
      clearing balance path is unchanged, then compare its transition dates
- [ ] If several savings/debt focuses are live, ask or omit the conditional
      estimate. Do not pick the highest rate, largest contribution or first
      account in config order
- [ ] Decide which edits establish a new baseline without producing a message
      (loading YAML/share links and structural renames are the obvious cases),
      so a half-typed number or renamed goal does not generate nonsense
- [ ] When no valid milestone moves, distinguish genuinely no measured effect
      from money diverted into an accumulating clearing account. Reuse the
      shared finding; do not infer this separately in the UI
- [ ] Suppress downstream deltas when either run breaches a floor before that
      milestone, using the same breach result as `check`
- [ ] Do not invent a universal "financial independence" date. If a config has
      no declared goal that means retirement, report exact milestone changes
      rather than guessing which one is independence
- [ ] Prefer explanation over a new feature if the existing simulator already
      makes the trade visible once the page tells the person what to look for

### Phase 8 — Re-run the real eval

`commit: test: repeat the cold-agent harness eval`

- [ ] Run the published artefact from cold several times, not the source tree
- [ ] Score excess cash and over-saving explicitly, alongside the existing
      criteria
- [ ] Record enough evidence to reproduce the verdict without treating one
      transcript as a deterministic unit test
- [ ] The round is done only when the remaining failure is a person's stated
      trade-off, not something Luke catches by eye

---

## Decisions

- Phases 1–3 and the first Phase 4 eval landed on round 1's branch because the
  eval immediately exercised the harness it was reviewing. Round 2 starts from
  that commit rather than rewriting history to manufacture a clean boundary.
- The interrupted `idle-cash` implementation is retained as a POC on the round-2
  feature branch. It is not an accepted rule and must not be made green by
  merely updating the example's expected findings.
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
