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

We may not need an answer in every layer. POC the candidates, then choose the
smallest combination that gives an agent a known-good next move and gives a
person useful information rather than noise.

- [ ] Record the full candidate set from review before developing the current
      `idle-cash` experiment further
- [ ] Build synthetic, deterministic cases for: genuine low-yield accumulation;
      a normal cycling sinking fund; an account already offsetting a loan; a
      locked investment with a higher headline rate; and a financially trivial
      difference
- [ ] POC the current opportunity-cost calculation: average balance × the gap
      to the best reachable return, expressed as dollars per year
- [ ] POC a counterfactual calculation through the real engine: make one
      equivalent placement change, rerun, and measure the actual difference.
      This costs more code and runtime but naturally sees offsets, loan payoff
      dates, and goal phases that a headline-rate comparison misses
- [ ] Keep annual rebaseline as a candidate remedy, not a foregone schema
      change. Compare a balance-dependent transfer such as `sweep_above` with
      an account policy such as `rebaseline_to`, and with making no engine
      change at all
- [ ] Decide whether any result belongs in `lint`, the `check` acceptance
      criteria, `--flows`, the browser UI, or more than one of them. One shared
      calculation must feed every chosen surface
- [ ] Record the decision and why the rejected options are unnecessary; remove
      rejected POC code rather than leaving parallel mechanisms behind

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

### Phase 7 — Catch the opposite of overspending

`commit: feat: flag a plan that saves past its purpose`

- [ ] Decide whether the upper bound is universal or declared by the plan
- [ ] POC the measurable candidate from the first eval: a retirement fund
      still growing in real terms at 90, rather than merely surviving to the
      chart horizon
- [ ] Add a deterministic fixture that starves the present to leave excessive
      money late, without changing the person's declared spending
- [ ] Give the harness a next move that cannot silently turn spending into a
      tuning knob

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
