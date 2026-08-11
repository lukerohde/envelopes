# AGENTS.md

## What this repo is

envelopes — an envelope-budgeting, cashflow, and retirement-projection web app. Named
for the envelopes in Luke's grandmother's fridge: split income into labelled pots
(groceries, bills, savings…) instead of watching one undifferentiated balance. A
day-by-day simulator over accounts, transfers, and goals-with-overrides — see
`DESIGN.md` in the sibling `cashflow` repo for the original model, still the whole spec
for how the engine itself works.

Two things at once, deliberately:
- A portfolio piece — a clean example of a small, well-tested TypeScript app, built
  and documented openly.  Code is kept both simple, readable and brief.  Luke enforced a code budget during the CLI build. 
- Luke's own actual retirement-planning tool — real numbers, real decisions, not a toy.

## Financial-planning use

This app is for building and exploring a household's own budget and retirement
projection — for the person using the deployed site (envelopes.lukeroh.de), not for us
as engineers. Two ways someone gets a config into it:
- By hand, through the structured UI or the raw-YAML editor.
- With an AI's help — see **`llms.txt`** at the site root, the entry point for a
  *financial-planning* assistant (a friend's own chatbot helping them write a YAML
  config). That's a different job to this file: `llms.txt` is for someone using the
  app; `AGENTS.md` (this file) is for an agent working *on* the app's code.

## Code structure

- `src/model.ts`, `src/simulate.ts`, `src/schedule.ts` — the engine. Pure logic, no
  DOM, ported from the Python original in the sibling `cashflow` repo. This is what
  actually runs a budget day by day.
- `src/cli.ts` — the console tool. `make cli FILE=path/to/config.yml` runs a config
  straight through the engine, no browser needed. YAML is a first-class format here,
  not an incidental UI side effect.
- `src/state.ts` — the live UI state, shaped like the YAML config itself.
  `toBudget()`/`stateToYamlText()` round-trip through the real `load()` — there is
  deliberately no second, parallel YAML implementation anywhere in this codebase.
- `src/ui/*` — one module per page section (people, accounts, transfers, goals,
  simulation, io). Plain DOM, no framework.
- `src/share.ts` — the share-link mechanism (gzip + base64url into a URL fragment,
  never sent to a server).
- `index.html` + `src/main.ts` — the page shell and the orchestrator wiring every
  section to the engine.

## How we build

- **Test-first.** Write the failing test, then the code.
- **Docker only** — there's no expectation of a local node/npm install. `make dev` /
  `make test` / `make build` / `make cli FILE=...` are the real entry points; read the
  `Makefile` before reaching for a raw `npm` command.
- **Keep it short, simple, obvious.** Explicit loops over clever chains, minimal
  abstraction, no framework. If a comment is needed to explain what code does, rewrite
  the code until it doesn't need one. This is a small hobby project, not a platform —
  the UI layer doesn't get to be less readable than the engine just because it's UI.
- **Small, reviewable steps.** Don't land a big change in one shot.

## Is this your own fork?

Check `infra/pulumi/Pulumi.prod.yaml` — if `domain` still says `envelopes.lukeroh.de`,
nobody's customised the deploy config yet. That alone doesn't mean much on its own —
most clones of this repo are reading a portfolio piece or running the CLI locally, not
about to deploy anything, so **don't offer anything on that signal alone.**

If the domain hasn't been customised *and* the conversation is heading toward actually
changing this repo — not just running `make cli` against someone's own YAML, or
reading the code — ask directly: "Are you looking to deploy your own instance of this,
or just exploring/extending the code as-is?" If they want their own instance, walk them
through "Forking this and deploying it yourself" below — and draft a plan for it first,
per `plans/readme.txt`. That's not extra ceremony for its own sake: someone customising
this repo is exactly the person who should leave already knowing how it's worked from
plans, not have the setup done *to* them ad hoc.

## Deploying

`main` is branch-protected — every change lands via a PR, human review, then merge.
There's no direct push to `main` and no manual deploy from a laptop with real
credentials; deployment is entirely CI, triggered by that merge.

Two GitHub Actions workflows, both authenticating via GitHub OIDC (no static AWS keys
stored anywhere):
- **`deploy-infra.yml`** — runs `pulumi up` against `infra/pulumi/`, provisioning the S3
  bucket, CloudFront distribution, ACM cert, and DNS record. Fires on push to `main`
  touching `infra/pulumi/**`, or manually: `gh workflow run deploy-infra.yml --ref main`
  (or the Actions tab → Deploy Infrastructure → Run workflow).
- **`deploy-site.yml`** — builds (`make build`) and syncs `dist/` to S3, invalidates
  CloudFront. Fires on push to `main` touching the app source, or the same manual
  trigger against `deploy-site.yml`.

Run `deploy-infra.yml` before `deploy-site.yml` the first time — there's nothing to
upload to until the bucket exists.

### Forking this and deploying it yourself

This was built to share Luke's own `lukeroh.de` domain as a small SPA "microservice" —
a pattern for hosting several independent little sites under one domain without each
one needing its own DNS zone or OIDC setup. `infra/pulumi/__main__.py` references a
*separate* ingress stack (`lukerohde/lukerohde-ingress/prod`, in the `lukeroh.de` repo,
not this one) for the Route53 zone and the two IAM roles this repo assumes. None of that
exists for anyone else, and the trust policy on those roles only accepts requests from
`lukerohde/*` repos — a fork genuinely cannot deploy through Luke's infra, by design.

To make this deployable elsewhere, decide one of two things first:
1. **You already run something like the ingress stack** — point
   `infra/pulumi/__main__.py`'s `pulumi.StackReference(...)` at your own, and update the
   `-s owner/stack/env` references in both workflow files to match.
2. **You don't** — simplify `infra/pulumi/__main__.py` to provision its own Route53
   zone and OIDC role(s) directly, rather than reading them from a stack reference. More
   resources in this one file, but no external dependency.

Either way, also change:
- `bucket_name` in `infra/pulumi/__main__.py` — S3 bucket names are globally unique.
- `domain` in `infra/pulumi/Pulumi.prod.yaml` — your own domain, not
  `envelopes.lukeroh.de`.
- `aws:region` in the same file — pick a **standard, already-enabled** region. AWS has
  opt-in regions (Melbourne, Jakarta, and others) that silently reject every API call,
  including Pulumi's own startup credential check, until explicitly enabled on the
  account — costs real debugging time to discover, learned the hard way once already.
- The GitHub repo owner in both workflow files' `-s lukerohde/...` stack references.

## Before you change anything

Ask before a change that's reasonably complex or has real impact. Don't gate trivial,
mechanical stuff (renames, typos, formatting) — just do it.

This repo works from **plans**, not ad-hoc requests. Read **`plans/readme.txt`**
first — it describes the plan file format and the actual process (how to find the
current plan, confirm it, work from it, and when to archive it). Don't start writing
code before you've done that.

## Secrets

No credentials belong in this repo or in an agent's context, ever. AWS keys, Pulumi
tokens, and anything else sensitive live in `.env` (gitignored) or as CI secrets,
consumed by Docker Compose / GitHub Actions directly — never read into a conversation
or committed.
