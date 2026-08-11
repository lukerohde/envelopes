# envelopes

Envelope-budgeting, cashflow, and retirement-projection — a day-by-day simulator over
accounts, transfers, and goals. Named for the envelopes in my grandmother's fridge: put
money in labelled pots instead of watching one undifferentiated balance and hoping.

**Live:** https://envelopes.lukeroh.de

A TypeScript port of [the original Python engine](https://github.com/lukerohde/cashflow),
plus a portable UI: edit a number, watch the projection move. No backend, no accounts,
nothing stored anywhere but your own browser — or a URL you choose to share.

## What it does

- Model everyday spending, savings, loans (with offset accounts), and
  fortnightly/monthly/yearly transfers between them.
- Set goals — pay off a mortgage, retire at an age, hit a balance — each with its own
  overrides for what happens once it fires.
- Simulate 40 years forward, scrub through time, watch milestones tick.
- Edit the raw YAML directly, save/load it as a file, or generate a shareable link —
  the whole config compressed into the URL itself, never sent to a server.

## Building your own budget with AI help

Point your own chatbot at [`llms.txt`](https://envelopes.lukeroh.de/llms.txt) and
describe your finances — it can write you a starting config. Paste what it gives you
into "Edit as YAML" on the site.

## Running it locally

```
make dev     # http://localhost:4321
make test
make build
make cli FILE=path/to/your-config.yml
```

Docker only — no local node/npm install needed.

## Contributing / extending

```
git clone https://github.com/lukerohde/envelopes
cd envelopes
claude   # or codex, or whatever agent you use -- it reads AGENTS.md automatically
```

See [`AGENTS.md`](AGENTS.md) for the code structure, how we build, and the planning
process (`plans/`) this repo works from — including how to deploy your own instance
if you're forking rather than just reading along.

## License

This project is licensed under the [MIT License](LICENSE).
