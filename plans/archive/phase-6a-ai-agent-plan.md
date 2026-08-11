# Phase 6a — AI-agent-assisted use of this repo

**Status:** built.

## Objective

Two different audiences, one shared idea: point an AI agent at this repo and let it do
the work, rather than building bespoke UI for either job.

- **Part A — a friend builds their budget.** Friends aren't going to hand-write YAML.
  Rather than building the full in-page AI chat panel from the original Phase 6 vision
  (bring-your-own API key, called from the browser), let a friend's *own* chatbot — or
  a code-capable agent like Claude Code — build their config for them, reusing what
  already exists: the Raw YAML view and the console CLI. Cheaper, no new attack
  surface, works with a tool the friend already trusts.
- **Part B — a developer customises the repo.** `aws-quill` (the template this
  project's deploy pipeline is built on) has an AI-native installer pattern: `AGENTS.md`
  itself checks whether this looks like a fresh clone, and if so, offers to walk the
  user through making the repo their own — deploying their own instance, pointed at
  their own domain. envelopes needs the same offer, but narrower: most people cloning
  it are reading a portfolio piece or running the CLI, not necessarily wanting a live
  deployment, so ask rather than assume.

Both are "point an agent at this and let it help," just with different entry points
(`llms.txt` for Part A, `AGENTS.md` for Part B) and different jobs (build a budget vs.
extend/deploy the code) — bundled as one plan because they're the same underlying
idea, tracked together rather than as two disconnected pieces of work.

## Tasks

### Part A — financial planning (`llms.txt`)

Two tiers of agent, because they can do genuinely different things:

1. **A plain chatbot** (text only, no code execution) — reads a schema description,
   interviews the friend about their money, writes YAML as its output. The friend
   pastes that into "Edit as YAML" on the site and takes it from there themselves.
2. **A code-capable agent** (Claude Code, or a chatbot with code execution + repo
   access) — can clone `envelopes` (or just fetch the raw source files), run
   `make cli FILE=...` against the YAML it's drafting, and actually see the simulated
   numbers before handing anything back. Tighter loop, no browser needed to iterate.

Neither tier needs to know how a share link is built. Asking an LLM to hand-reimplement
gzip + base64url correctly every time is fragile; plain YAML text handed to the
already-working Raw YAML view is far more robust. If someone wants a link, the *human*
clicks "Copy share link" themselves once they're happy with what's in front of them.

- [x] Write the schema-description content: the YAML shape field by field, the
      scheduling quirks, and a worked example. Validated by actually running the
      embedded worked example through the real engine (`load()`/`run()`), not just
      eyeballed — loads clean, three goals complete in the expected order.
- [x] `llms.txt` at the site root — `public/llms.txt` in the repo, Vite's convention
      copies it straight into `dist/` at build time, confirmed present after a real
      build and served at `/llms.txt` by the dev server.
- [x] A visible, copy-paste prompt block on the page itself (`<details class="ai-prompt">`
      in the header, next to the existing io-bar) — Playwright-verified: opens on click,
      copy button writes the exact prompt text to the clipboard, checked in light and
      dark mode.
- [x] Q: does the on-page prompt block need its own UI treatment, or is a plain copy
      button enough? — **Resolved: a native `<details>` (matches the "no modals,
      inline disclosure" rule already set for this page) holding a read-only textarea
      + a plain copy button, same visual language as the existing io-bar buttons. No
      new UI pattern needed.**
- [x] Q: generate the schema doc from `state.ts`'s real types, or hand-write it? —
      **Resolved: hand-written. Generating from types would be new tooling (a doc
      generator) for a schema that's small and slow-changing — not worth it against
      "keep it simple," and hand-writing let the wording actually target how an LLM
      reads best rather than mechanically dumping type signatures.**

### Part B — repo customisation (`AGENTS.md`)

`AGENTS.md`'s existing "Forking" section already documents *what* needs to change
(ingress stack reference, bucket name, domain, region, GitHub owner). This part turns
that from passive documentation into an active offer the agent makes at the right
moment.

One more thing this needed to do, not just deploy a customised instance: **the
walkthrough itself should draft a plan and follow it**, the same way any other work in
this repo does (per `plans/readme.txt`). Someone forking to customise/extend the repo
is exactly the audience who should come away already knowing how this repo works from
plans — not have the setup done *to* them ad hoc while the actual convention sits
undiscovered in a file they never got pointed at.

- [x] Q: what's the actual signal for "developing this repo" vs. "using it"? —
      **Resolved: check `infra/pulumi/Pulumi.prod.yaml`'s `domain` — if it's still
      `envelopes.lukeroh.de`, nobody's customised it yet. That signal alone means
      nothing (most clones aren't deploying anything), so only ask when it's paired
      with the conversation actually heading toward changing the repo, not just
      running `make cli`/`make dev`.**
- [x] Write the check-and-offer instruction into `AGENTS.md` itself — new "Is this
      your own fork?" section, plain prose any agent reading the file can follow, no
      tool-specific mechanism required.
- [x] Decide whether the walkthrough content stays inline in `AGENTS.md`'s existing
      Forking section, or gets its own document — **Resolved: stays inline. The
      Forking section is already short and complete; a separate document would be an
      extra hop for no real benefit at this size.**
- [x] Add a quickstart to `README.md`: `git clone ... && cd envelopes && claude`,
      matching `aws-quill`'s own three-line quickstart.

## Decisions

- `llms.txt` (site root, e.g. `envelopes.lukeroh.de/llms.txt`) is the right convention
  for the financial-planning entry point — confirmed via research 2026-08-11. A W3C
  proposal to formalise it is in progress but not yet ratified; it's already a working
  convention with real adoption across major AI platforms. This is distinct from
  `AGENTS.md` at the repo root, which is for a coding agent extending/customising the
  codebase, not for someone building their own budget — different file, different job,
  which is why Part A and Part B stay clearly separated within this one plan.
- No password/encryption on share links (discussed same session as this plan was
  written). The URL-fragment design already keeps a link off the server entirely; real
  protection would need actual encryption with the key handed over through a separate
  channel, which isn't the problem being solved for "share your budget with a friend."
- Model Part B on `aws-quill`'s existing pattern rather than invent a new one — a
  fresh-clone check plus an offer, described in `AGENTS.md` itself. The one deliberate
  difference: `aws-quill` assumes deploy intent by default (it's a template repo);
  envelopes asks first, because most clones aren't heading toward a deployment at all.
- No slash command needed for Part B. Checked `aws-quill`'s actual mechanism: there's
  no script or special tooling behind its `claude` one-liner — Claude Code reads
  `AGENTS.md` automatically on startup, and the fresh-clone check is just prose in that
  file. Its `/setup` command is a *reference point* the instruction points to for the
  detailed walkthrough, not a required mechanism. Same shape works here, no new
  machinery.
- The `git clone && cd && claude` quickstart belongs in `README.md`, never `AGENTS.md`.
  It's an instruction for a *human*, to run *before* any agent exists in the picture —
  by the time an agent is actually reading `AGENTS.md`, that step has already happened,
  so writing it there would be telling the agent to do something it's already three
  steps past. `AGENTS.md` picks up from "an agent is now running here," `README.md`
  covers "how a human gets to that point" — a general split worth keeping in mind
  anywhere both files exist, not just here.
- `public/llms.txt`'s worked example is a verbatim copy of `src/example.yaml`, not a
  separate hand-crafted one — one real, engine-verified example beats maintaining two
  that could quietly drift apart.

## Out of scope

- The full in-page AI chat panel from the original Phase 6 vision (bring-your-own API
  key, called directly from the browser, bank-statement-in/config-out). Part A is
  deliberately the cheaper version that reuses tools a friend already has. Phase 6
  proper can still happen later if it turns out to still be wanted once this exists.
- An automated test asserting Part B's check-and-offer behaviour — it's an instruction
  to an agent reading a markdown file, not code with a deterministic output; verifying
  it means actually cloning this repo fresh and watching what an agent does, which is
  a real thing worth doing but isn't a Playwright-style check.

## Reference content (now live in `public/llms.txt`)

The preamble and privacy guarantee below were drafted here first and are now the real
file — kept here too so the reasoning behind the wording stays attached to this plan.

### Preamble

> envelopes takes its name from a real habit: my grandmother kept envelopes in her
> fridge, one per spending category, cash divided between them on payday. Groceries had
> its own envelope, bills had theirs, and when an envelope was empty, that category was
> done spending for the period — not a guess, not a vibe, just what's actually left.
> Envelope budgeting is that idea formalised: instead of one undifferentiated bank
> balance you're hoping covers everything, money gets allocated into named accounts
> (envelopes) as it arrives, and each envelope only ever holds what it's actually meant
> to cover.
>
> This tool runs that idea forward in time. Every account has an opening balance and,
> optionally, an interest rate and a floor (the minimum it should never drop below).
> Transfers move money between accounts on a schedule — weekly, fortnightly, monthly,
> yearly — the same rhythm real pay and bills follow, so the simulation matches how
> money actually moves through a household, not an average smoothed over a year. Two
> timeframes live in the same model: everyday cashflow (pay in, groceries/bills/card
> spending out, every week or fortnight) and the long retirement horizon (super
> contributions, drawdowns, a mortgage paid off over years) — because they're not
> actually separate problems, they're the same accounts and transfers, some firing
> weekly and some firing once a decade. Goals sit on top of all that: a goal watches for
> a date, an age, or a balance being reached, and can redirect money once it fires —
> stop the mortgage repayment, start funding retirement savings instead, the moment the
> house is paid off, say. That's how a real plan actually changes shape over a
> lifetime, modelled as data instead of hand-waved.

### Privacy guarantee

> - No account, no login, no signup. Nothing about you is collected, because nothing is
>   asked for.
> - No backend. This is a static site — HTML, CSS, and JavaScript served from a CDN.
>   There's no server processing your numbers; every calculation runs in your own
>   browser.
> - Nothing is stored anywhere by default. Close the tab and it's gone, same as a piece
>   of paper you didn't keep. Keeping something is an explicit choice you make: **Save**
>   downloads a plain YAML file to your own computer; **Copy share link** puts your
>   whole config into the URL itself, compressed — never sent to any server, because a
>   URL fragment (the part after `#`) is never included in the actual request a browser
>   makes, so it never reaches a CDN, a bucket, or any access log.
> - No analytics, no tracking, no cookies.
> - No AI is called from inside this app, and no API key is ever asked for here. If you
>   want AI help building a config, you bring your own — paste your finances into
>   whatever chatbot you already use and trust, on their terms, not ours. This tool
>   never sees that conversation, and nothing here talks to any AI service on your
>   behalf.
