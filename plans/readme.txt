PLANS -- how we work in this repo
==================================

A plan is one markdown file describing one unit of work. Every plan uses the same
four sections, in this order:

Objective
---------
What this achieves, and why, in plain language. Someone unfamiliar with the work
should be able to read this and know what's being built and why it matters.

Tasks
-----
    - [ ] one task per line, checked off as it lands

A task can be a real clarifying question instead of a code change, e.g.
"- [ ] Q: which region should this deploy to?" -- an open question is unfinished
work too. It belongs here, not in a separate list that gets forgotten.

Decisions
---------
Choices made while doing the work, and the reasoning behind them -- so a later
reader (human or agent) doesn't have to re-derive why something ended up the way
it did, or accidentally re-litigate something already settled.

Out of scope
------------
What this plan deliberately does NOT cover. Keeps scope from creeping, and stops
the same "should we also..." conversation happening twice.


WORKING FROM A PLAN
====================

Before touching any code: read this file and find out what's current, below.

  - If there's exactly one current plan, that's what you're working on.
  - If there's more than one, ask which one before doing anything else. Don't
    guess.
  - If there's none that covers what's being asked, draft a new one.

Once you know what you're building, restate it back -- objective, tasks,
decisions so far, out of scope -- and get an explicit yes before starting. Don't
assume, don't start coding off a half-formed idea.

As work lands, check tasks off in the actual plan file, not just in
conversation. The file is the record, not the chat that produced it.

When a plan looks done -- every task checked, nothing dangling -- ask whether to
archive it. Don't archive unasked; it might still be under review. Archiving
means: move the file (and anything it references, like a mockup or a spec) into
plans/archive/, and update the two lists below.


CURRENT PLANS
=============

- agent-harness-round-3-plan.md -- the friction a *passing* agent still hit:
  put the intent interview where it can't be walked past, make a share link
  check its own work, stop a date-triggered goal demanding an account, report
  transfers that never fire, stop short phases annualising ordinary swing into
  an alarm, give the CLI --help and --start, and pay back some duplication.


ARCHIVED PLANS
==============
- archive/agent-harness-round-2-plan.md -- feedforward, not just feedback:
  said what a good plan looks like, gave every finding a next move, and added
  `check`, `sweep_above` and `compareOutcomes`. Shipped, merged as PR #4. A
  fresh agent then used it to build a real budget end to end -- and what it
  hit on the way is what round 3 is made of. Two eval runs stay open and are
  carried into round 3's phase 8.
- archive/agent-feedback-round-1-plan.md -- made the tool legible to an AI
  agent handed a share link, then closed the engine and schema gaps that review
  exposed. Shipped for review in PR #3.
- archive/ux-feedback-round-4-plan.md -- clearer goal overrides, account
  choices, share URL notice, and raw-YAML editing. Shipped, merged.
- archive/phase-1-python-cli-plan.md -- built retirement goals into the Python
  CLI by cutting it down to what actually mattered (accounts, transfers,
  goals-with-overrides). Lives here for posterity; the actual work happened in
  the sibling cashflow repo, which doesn't use this convention.
- archive/phase-2-typescript-port-plan.md -- ported the Python CLI to
  TypeScript, this repo's actual origin. Shipped, merged.
- archive/phase-3-ui-plan.md (+ archive/phase-3-mockup.html, its spec of
  record) -- the real six-section UI (People/Accounts/Transfers/Goals/
  Simulation+Milestones), replacing the old five-input demo. Shipped, merged,
  live.
- archive/phase-4b-yaml-plan.md -- raw-YAML view, load/save as a file, and a
  stateless share link. Shipped, merged, live.
- archive/phase-6a-ai-agent-plan.md -- llms.txt for a friend's own chatbot, and
  AGENTS.md's fresh-clone offer for a developer's coding agent. Shipped, merged.
  One loose end carried into ux-feedback-round-2: its "run the CLI" instructions
  only work with Docker, which agent sandboxes don't have.
- archive/ux-feedback-round-3-mobile-plan.md -- compact mobile editors, people
  summaries, a smaller bookmark notice, and clearer simulation endpoint context.
- archive/ux-feedback-round-2-plan.md -- the date-picker, naming, transfer,
  AI-prompt, one-off transfer, and first-use polish round.
