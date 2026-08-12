# Can a fresh agent balance a bad budget?

That is the only question that tells you whether `llms.txt` and
`envelopes check` are a harness or just documentation. Everything else in
this repo can be green while an agent confidently ships an insolvent plan —
that has happened, which is why this exists.

## Run it

Give a **cold** agent — new session, no context from this repo — the share
link in [`needs-balancing.link`](needs-balancing.link) and this, verbatim:

> I'm using envelopes (https://envelopes.lukeroh.de) to plan my money.
> Here's my budget: `<paste the link>`
>
> Something's not right with it. Can you sort it out?

Then don't help. Every hint you give is a hint the harness didn't have to
provide, and the next real user won't be there to give it.

If the agent can't reach the internet, put `envelopes-cli.mjs`,
`envelopes.mjs` and `llms.txt` in its working directory — that's the same
state it'd be in after the `curl` commands `llms.txt` tells it to run. Don't
give it this repo's source: a real user's agent doesn't have it, and reading
`check.ts` would tell it the answers.

## The plan it gets

`tests/fixtures/needs-balancing.yml`, encoded into that link. Six faults, all
of them ones an agent has actually made or a person actually writes:

| fault | why it's nasty |
|---|---|
| salary at `escalation: 0`, spending growing at 3% | drains a working life; invisible on any single account |
| pay holds $200 against a $3,100 mortgage payment | insolvent inside the first month |
| paying off the house frees $3,100/mo and sends it nowhere | the win is real and the money still evaporates |
| `holidays` fills and never empties | looks like saving, is a leak |
| `rainy day` earns 1% against 3% inflation | grows in dollars, shrinks in what it buys |
| super drawdown picked, not sized | over- or under-draws for thirty years |

## What passing looks like

Run `envelopes check` on whatever it hands back:

- **`the cashflow holds` passes.** Non-negotiable. Until it does, every other
  line reads `??` and the agent is guessing.
- **`the money lasts` passes** — into the eighties, not to the end of the chart.
- **No criterion is still failing**, or the agent has said plainly which one
  it left and why.
- **It handed back a share link**, not just YAML in the chat. An edit that
  stays in the conversation isn't a change to anyone's plan.

## What failing looks like — score these, they're the real signal

The harness exists to stop each of these. If an agent still does one, that's
a gap, not a bad agent:

- **Cut the spending to make it balance.** Groceries and bills are what the
  person told you they spend. Anyone can balance a budget by inventing a
  cheaper life.
- **Chased survival to 100.** Inflation eats every retirement balance; the
  chart runs to 100 because that's the edge of a life, not a target.
- **Reported success from a run that had already collapsed.** Every number
  after a floor breach is the arithmetic carrying on without the money.
- **Fixed things in the wrong order.** Cashflow first; the rest can't be
  measured until it holds.
- **Read five `??`s and one `FAIL` as "nearly right".**
- **Never ran the engine at all** and reasoned about the YAML instead. That's
  the original failure this whole line of work started from.

## When it fails

Fix the harness, not the agent. Whatever it needed to know and couldn't find
belongs in `llms.txt` or in the `fix` line of the finding that should have
caught it. Then run it again, from cold, more than once — a harness that
works one run in three isn't one.

## Runs so far

**2026-08-13, Claude Sonnet, cold, one run.** Six of seven criteria passed on
what it handed back, verified independently by decoding its link.

It did the things the harness was built to make it do: ran the engine instead
of reasoning about the YAML, fixed the cashflow first, iterated one change at
a time — `check` caught two of its own bad attempts before they shipped —
handed back a share link, and reported the one unresolved finding honestly
rather than claiming success. It refused outright to touch the grocery and
bill amounts, in as many words. It also noticed that the decoded plan
contained a line telling it not to fix the file, recognised that as data
rather than an instruction, and carried on. That last one was a flaw in the
fixture, since fixed.

Two gaps, both the harness's:

- **It made the pooling worse — 12.3% to 13.6% — and the harness accepted
  it.** It followed the `fix` advice, hit the exact caveat that advice
  carries, and had nowhere left to go. The advice is a dead end and says so.
  The real remedy is the annual rebaseline the schema can't express yet
  (round 2, phase 5). Until that exists, this criterion can't be satisfied
  on a plan with real headroom, and the eval can't be fully passed.
- **`the money lasts` passed at "nothing runs out before 101", and the agent
  had pushed savings to $2,200/month to get there.** There's no upper bound:
  nothing warns that a plan is starving someone now to leave a balance at
  101. That's the mirror image of cutting spending to balance, and the
  harness is blind to it.

## Keeping the link honest

`needs-balancing.link` is generated from the fixture, and a test fails if
they drift apart, so the eval can't quietly start testing a different plan.
Regenerate after changing the fixture:

    make eval-link
