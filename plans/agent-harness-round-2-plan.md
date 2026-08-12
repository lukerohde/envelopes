# envelopes — a harness a fresh agent can actually pass

Implementation brief, phased. Each phase is one commit.

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
`llms.txt`, and it balances it without a human catching anything. That test
is Phase 4, and until it passes nothing else here counts.

---

## Phase 1 — Say what good looks like

`commit: docs: state the acceptance criteria for a plan, not just the faults`

Every judgement that mattered in round 1 came out of a conversation and was
written down nowhere. A fresh agent re-derives them and gets them wrong.

- [ ] Write the objective into `llms.txt`, above the rules: a plan holds its
      cashflow throughout, the account that eventually gives out is the
      retirement fund and not the everyday one, clearing accounts don't
      trend, envelopes cycle, every goal fires
- [ ] **Aim for the eighties, not the horizon.** Inflation eats every super
      balance; surviving to 101 needs either a fortune or spending nobody
      would accept. Say so, and say that where it runs out is the user's
      decision to make
- [ ] **Spending is an input, not a tuning knob.** An agent that balances a
      plan by cutting someone's groceries has not balanced anything. Say it
      in those words
- [ ] Q (resolve at review): are these criteria universal, or does a plan
      need to declare its own? A 25-year-old saving a house deposit has a
      different shape and "runs out in the eighties" is meaningless for them

---

## Phase 2 — Make each finding carry its next move

`commit: feat: findings say what to change, not just what's wrong`

`clearing-account-accumulating` tells you money is pooling. It doesn't say
which knob moves it, or what that knob will break — and they are all
coupled, which round 1 discovered by thrashing and recorded nowhere.

- [ ] Add a `fix` field to `Finding`: the specific lever, the direction, and
      the finding it's likely to trigger instead
- [ ] Document the coupling explicitly. Raising the super contribution to
      soak a surplus makes the plan last longer, which gives the
      retirement-side over-draw more years to pool, so the leak gets
      *bigger*. That is not discoverable by reasoning; it has to be written
- [ ] **Order the findings.** A floor breach freezes every downstream
      number, so fixing cashflow first isn't a preference — nothing else is
      real until it holds. The list should be sorted by what to do first

---

## Phase 3 — `envelopes check`

`commit: feat: a plan check that ends in a single next instruction`

`lint` answers "what's wrong". The missing half is "what now".

- [ ] `envelopes check plan.yml` — the acceptance criteria as a pass/fail
      list, then the one thing to do next
- [ ] Runs at the same horizon as the page, always. Round 1 shipped a
      console tool running 40 years against a page running 55, so an agent
      and its user got different verdicts on the same plan
- [ ] `--json` for agents, exit non-zero while anything fails
- [ ] `make plan-check FILE=...`
- [ ] Delete nothing from `lint`: `check` is `lint` plus ordering, criteria
      and a next step. One rule engine, not two

---

## Phase 4 — Prove it on a plan that's actually broken

`commit: test: a broken plan, and the harness that talks you through it`

The only test that matters. Everything above is a guess until this passes.

- [ ] `tests/fixtures/needs-balancing.yml` — one deliberately bad plan
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

## Phase 5 — Annual rebudget and cashflow rebaseline

`commit: feat: periodic sweep of clearing-account drift`

**Luke's own practice, and the answer to the one leak round 1 couldn't tune
away.** In real life the drift in a clearing account is handled by sitting
down once a year, re-budgeting, and rebaselining it — reallocating whatever
has piled up and resetting the account to its working balance. The model
can't express that, which is why the worked example still carries a
`clearing-account-accumulating` finding that no combination of five coupled
knobs would remove.

The gap is that every transfer moves a *fixed* (or escalating) amount.
Nothing can move "whatever is above the line".

- [ ] **Balance-dependent transfers.** Something like:

```yaml
- name: annual rebudget
  every: year
  day: 07-01
  out_of: pay
  into: early retirement
  sweep_above: 5000     # move the excess over this, or nothing
```

- [ ] Q (resolve at review): `sweep_above` on a transfer, or a property of
      the clearing account itself (`rebaseline_to: 5000`)? The account is
      arguably where it belongs — it's a fact about how that account is
      run, not about one movement — but transfers are where every other
      movement lives, and two mechanisms for moving money is one too many
- [ ] Q (resolve at review): what happens when the account is *below* the
      line at sweep time? Doing nothing is the safe reading. Topping it back
      up from the destination is the honest one, and it's what actually
      happens in a real rebudget — but it can drain a savings account
      silently, which is the class of bug this whole round exists to stop
- [ ] Apply it to `src/example.yaml` and confirm the leak closes
- [ ] `clearing-account-accumulating` should then suggest a rebaseline as
      its fix, since that's the real-world remedy rather than a knob tweak
- [ ] Document it in `llms.txt` — this is the piece of household budgeting
      practice the schema is currently missing, not just a convenience

---

## Out of scope

- The solver from round 1's "Later" list. A rebaseline sweep may remove the
  need for it: much of what a solver would search for is the drift a yearly
  rebudget handles directly.
- Anything about the deploy, the share codec, or discovery. Round 1 covered
  those and nothing here touches them.
