# UX feedback round 2 — a friend actually used it

Objective
---------
Luke watched a friend use the live site and wrote down where it fought them. Eight
things, all in the "this is embarrassing in front of someone" category rather than
"it computes the wrong number": a date picker that can strand you in the year 80, an
account you can't name, a delete button dressed as a close button, an unlabelled
grid of columns, no way to say "this happens once", an AI prompt that doesn't ask
the person anything about themselves, and a page that opens with two paragraphs of
preamble and five expanded sections before you see a single number.

Not one of the six vision phases — a polish round on what's already live, same shape
as the "Phase 3 UX feedback round" that ran on 2026-08-11.

Tasks
-----

**The date picker (native, hardened)**

    - [x] Failing test first: an out-of-range date snaps back instead of standing
    - [x] `min`/`max` on all three date inputs — `src/ui/people.ts` (birthdate,
          1900–today), `src/ui/goals.ts` `triggerFieldsHTML` (goal `by`,
          today–2100), `src/ui/transfer-fields.ts` `onFieldHTML` (fortnight/year/
          once anchor, today–2100). Bounds what the calendar can navigate to, so
          century-paging stops.
    - [x] Clamp on `change`: a typed year outside the bounds (the `80` → year 0080
          case that started this) snaps back rather than being accepted

**Naming an account**

    - [x] Failing test first: rename an account referenced by a transfer's
          `out_of`/`into`, another account's `offsets`, a goal's `account` and a
          goal's account-rate override — all four follow it
    - [x] `renameAccount()` in `src/state.ts`, next to `removeAccount()` and
          cascading through the same set of references
    - [x] Account name becomes an editable input in `src/ui/accounts.ts`, cascading
          on `change`/blur rather than every keystroke so a half-typed name never
          propagates

**Naming a transfer, and reclaiming the width to fit it**

    - [x] Failing test first: rename a transfer referenced by a goal's override —
          the override follows it
    - [x] `renameTransfer()` in `src/state.ts`, cascading into goal transfer
          overrides (the only place a transfer name is referenced), same shape as
          `renameAccount()`
    - [x] Name becomes the first column of the shared row in
          `src/ui/transfer-fields.ts` — editable in the Transfers section,
          read-only in a goal's override list, where today you identify a row only
          by its from/to
    - [x] Reproportion the grid: From/To drop from 1.2fr to .85fr each to pay for
          Name at 1.1fr; `.transfers-table` min-width 640px → 660px (700 and 740
          were both tried and both overflowed a goal card, clipping the last
          heading). Both the `t-head` in `index.html` and the goal heading row
          above get the new column.
    - [x] New transfers added in the UI get a unique default name, not a third copy
          of "new transfer"

**The ✕ that isn't a close**

    - [x] Swap ✕ for a bin glyph on every remove button — `people.ts`,
          `accounts.ts`, `transfers.ts`, `goals.ts`. Same button, same job
          everywhere, no longer disguised as "close this card".

**Goal columns have no headings**

    - [x] Goals reuse the exact From/→/To/Amount/Every/On/Inflation grid from
          Transfers (`transfer-fields.ts`) but never render the `t-head` row above
          it. Render it above each goal's override list, indented past the checkbox
          column so it lines up.

**A one-time transfer**

    - [x] Failing test first: `every: once` fires on exactly its date and no other
          day, across a multi-year run
    - [x] `fires()` in `src/schedule.ts` gains `once` — `day` is a real date, fires
          when `when === day`. Three lines; the header comment's frequency table
          gets a row too.
    - [x] `once` in the Every dropdown (`everySelectHTML`) and treated as a date
          field in `onFieldHTML`, same as fortnight/year
    - [x] Escalation still applies and that's deliberate: a $40k car in 2035 entered
          in today's money should inflate by 2035. No special-casing.
    - [x] `once` appears everywhere the other four do: the Every dropdown,
          llms.txt's schema, llms.txt's `day`-meaning table, `schedule.ts`'s header
          comment

**The AI prompt doesn't grill anyone**

    - [x] `public/llms.txt`'s "Your job" step 1 is one vague sentence. Rewrite it as
          an explicit interview checklist the assistant must complete before writing
          any YAML: who's in the household and their birthdates (`by_age` goals are
          impossible without them), each income and how often it lands, regular
          spending, debts and their rates, savings and super, and what they're
          actually aiming at — retire by an age, pay something off, hit a target.
          One question at a time, don't write the config until it has the lot.
    - [x] Add `once` to llms.txt's `every` list and its `day`-meaning table
    - [x] The in-page prompt in `index.html` stays the short "go fetch llms.txt"
          pointer — llms.txt is the thing that gets fetched, one place to maintain

**A library file an agent can actually run** (extends Phase 6a Part A, tier 2)

`llms.txt` currently tells a code-capable agent to clone the repo and run
`make cli FILE=...`. That's Docker-only (see the Makefile), so for most agent
sandboxes the whole "actually simulate it before handing it back" tier is dead on
arrival. Fix it two ways: document the Node-only path, and publish something that
needs neither a clone nor a package install.

    - [x] A second Vite build in lib mode emitting `dist/envelopes.mjs` —
          self-contained ESM exporting `load()`, `run()`, and a one-call
          `simulate(yamlText)`, with `js-yaml` bundled in. `emptyOutDir: false` so
          it lands alongside the site build rather than wiping it; `npm run build`
          chains both.
    - [x] `dist/envelopes-cli.mjs` — thin wrapper so `node envelopes-cli.mjs
          config.yml` works after a single `curl`, no clone, no npm install
    - [x] Test: run the published bundle in Node against `src/example.yaml` and
          assert it matches what `src/cli.ts` produces — a bundle that silently
          drifts from the real engine is worse than no bundle
    - [x] Rewrite llms.txt's code-capable-agent paragraph: lead with
          `curl https://envelopes.lukeroh.de/envelopes.mjs` and a worked snippet,
          mention `npx tsx src/cli.ts config.yml` as the clone-based path, and stop
          pointing at `make cli` — Docker is the one thing an agent sandbox almost
          certainly doesn't have
    - [x] Say plainly in llms.txt that this is a JavaScript path: an agent whose
          sandbox only runs Python should write the YAML and let the human paste it
          into the site, which is the tier-1 flow and already works
    - [x] Deployment is free — `dist/` is what `deploy-site.yml` already syncs

**Losing your plan when you click your bookmark**

Today the share link is a one-off snapshot: you click "Copy share link", bookmark
it, keep editing, and the bookmark still holds the old budget. Fix: the address bar
tracks every edit, and a floating bar tells you when the page holds work your
bookmark doesn't.

    - [x] Debounced `history.replaceState` (~400ms, same reasoning as the recalc
          debounce) writes the encoded state into the fragment on every change, so
          the address bar always holds the current budget. `replaceState`, not
          `pushState` — the back button restoring a half-typed budget is not a
          feature.
    - [x] A floating bar, appearing once the state differs from what was loaded:
          says the budget lives in the page's address, carries a "Copy link" button
          and a "press ⌘D / Ctrl+D to bookmark this page" hint, and dismisses.
    - [x] `beforeunload` warning while there are changes the user hasn't copied or
          saved. Browsers show their own generic wording; we don't get to write it.
    - [x] Test: edit, read `location.hash`, decode it, assert it round-trips to the
          same budget — the address bar being *silently* stale is the exact bug
          being fixed here
    - [x] Playwright: edit a value, confirm the address bar moved; reload the page
          raw and confirm the edit survived

**Collapse the page down**

    - [x] Wrap the grandmother/envelopes preamble (`.intro` in `index.html`) in a
          collapsed `<details>` titled "Background", styled like the existing
          "Build this with AI" one. The one-line subtitle under the `<h1>` stays
          visible — something has to say what the page is.
    - [x] Turn each `section.block` into a `<details>` with its `<h2>` as the
          summary; People, Accounts, Transfers and Goals closed by default,
          Simulation open
    - [x] Check the chart still measures itself correctly (Simulation is open on
          load, so it should — but verify, the SVG sizes off layout)
    - [x] Playwright pass in both light and dark: expand each section, edit a value,
          confirm the simulation still recomputes from a collapsed section

Decisions
---------
- Not a vision phase, a polish round. Same shape as the 2026-08-11 feedback round
  that followed Phase 3.
- **Three silent bugs found while adding `once`, fixed here rather than left.** The
  On column wrote values the engine couldn't read, and the transfer then simply
  never fired — no error, money just missing from the projection. A weekday select
  valued "Sat" against an engine matching "sat" (which also meant a config loaded
  with `day: sat` matched no option and displayed Monday instead); a day-of-month
  select writing the string "16" against a `===` on a number; a yearly transfer's
  date picker writing "2030-12-25" where the engine reads month-day, so
  `splitMonthDay()` took 2030 as the month. All three fixed in `fires()`, the single
  place `day` is interpreted, which also makes hand-written and LLM-written YAML
  forgiving about spelling. A new transfer also defaulted to `every: fortnight,
  day: "Fri"` — a fortnight needs an anchor date, so that default never matched
  anything either.
- **The "stopped" tag moved inside the Name cell.** As its own flex child beside the
  row it pushed every stopped row out of line — invisible until there were column
  headings to be out of line with.
- **The last column heading is "Infl.", not "Inflation".** The column under it is
  one checkbox wide; the full word overflowed the card. The button keeps the long
  form as its title and aria-label.
- **Date picker: hardened native, no library.** jQuery UI's datepicker is dead
  (maintenance-only since 2021); the modern equivalent is flatpickr, zero deps,
  ~15kb, with month/year dropdowns. Not worth a second runtime dependency here —
  `min`/`max` plus a clamp is ~10 lines and kills both reported symptoms. Revisit
  if the native picker's per-browser inconsistency turns out to be the real
  complaint.
- **Account rename cascades, rather than locking the name after creation.** Locking
  is the same trap the Opening balance field had, which we already fixed once.
- **Bin glyph everywhere, not just on goals.** Two glyphs meaning "delete" is worse
  than one glyph in a slightly awkward spot.
- **The interview checklist lives only in llms.txt.** Duplicating it into the
  in-page prompt means two places to keep in sync.
- **Transfers get a Name column after all**, editable in Transfers and read-only in
  goal override lists. The name was always in the YAML and in `state.ts`; the grid
  just never showed it, which is also why every transfer added through the UI is
  called "new transfer". From/To shrink to pay for the width.
- **Live URL, not localStorage.** The address bar tracks every edit; nothing is
  stored. Keeps the privacy guarantee true word for word — "close the tab and it's
  gone" stays honest, no copy to rewrite, no budget left sitting in a shared
  computer's browser. The trade, stated plainly: an *existing* bookmark still holds
  the old budget, because a bookmark is a frozen copy of a URL. What this buys is
  that the address bar is never stale, so re-bookmarking or copying the link is
  always correct, and the floating bar makes the moment to do it visible.
- **There is no "add a bookmark" API**, so the bar can't do it for you. Browsers
  removed the old ones (`window.sidebar.addPanel`, `window.external.AddFavorite`)
  deliberately — adding a bookmark is a user action, not a page's to take. The bar
  gets a real Copy link button and a ⌘D/Ctrl+D hint instead. Worth knowing: ⌘D on a
  changed fragment makes a *second* bookmark rather than updating the first, since
  browsers match on the exact URL.
- **Fragment size is fine.** `example.yaml` is ~3kb of YAML, ~1.1kb once gzipped
  and base64url'd. Well inside what browsers handle; some third-party tools truncate
  URLs around 2000 characters, which a very large budget could eventually reach.
  Revisit if that ever actually bites.

Out of scope
------------
- Phase 4's floor-breach game mechanic. Phase 6a is archived as done; the only bit
  of it carried in here is the runnable library file, because its CLI instructions
  turned out to need Docker.
- localStorage, and any other persistence beyond the URL. Decided against above.
- Any change to the YAML schema or the simulation maths. The one engine change here
  is `once` in `schedule.ts`, which adds a frequency without touching how money
  moves; `renameAccount()`/`renameTransfer()` are state plumbing that produce the
  same YAML either way.
- Confirm-before-delete dialogs. The page committed to no modals and that stands —
  the ✕ complaint is about the glyph reading as "close", not the missing confirm.

Follow-up (Luke, while testing locally)
---------------------------------------
    - [x] The keep-this bar fades itself away after 8 seconds instead of sitting
          there until clicked. Fades in on the first edit, fades out on its own,
          on Dismiss, and on Copy/Save. `unkept` deliberately does *not* change
          when it fades — a timer nobody watched must not silently disarm the
          exit warning — so the bar reappears on the next edit only after the
          budget has actually been kept.
    - [x] The "stopped" tag is a mark, not a word. On a narrow screen the word
          crowded the Name column it shares a cell with, pushing names into
          truncation. It only ever said "this transfer's amount goes to zero when
          this goal fires", which the Amount column already shows — so it's now a
          no-entry glyph with that sentence as its title/aria-label, sitting after
          the name so every name input still starts at the same x.

Round 3 (Luke, testing locally)
-------------------------------
    - [x] A goal can start a transfer that exists nowhere else -- "Add a transfer"
          inside a goal's editor. The YAML always allowed this (example.yaml's own
          "bridge drawdown"); the UI had no way to do it.
    - [x] A goal-introduced `once` transfer with no date fires when the goal fires.
          For a balance- or age-triggered goal there's no date you could type in
          advance -- the completion date is whatever the simulation works out. Lands
          the day after completion, because run()'s loop makes the day's transfer
          pass before it checks goals.
    - [x] A blank `day` is left out of the YAML rather than written as `''`. No
          frequency matches an empty string, so writing it would be a value that
          silently never fires -- and its absence is what carries the meaning above.
    - [x] Only the goal that introduced a name can rename it; everywhere else the
          name is the key picking out which transfer the row overrides.
    - [x] The simulation runs until the youngest person turns 100, rounded up to
          whole five years, instead of a fixed 40. Timeline ticks generated from it.
    - [x] The STOPPED word became a no-entry mark (see Decisions).
    - [x] Import…/Export… instead of Load…/Save, the button bar above Background,
          and an ellipsis after each collapsible header while it's shut.
    - [x] Q (Luke's call): at the new 60-year default, example.yaml showed "run
          stopped -- super alex hit its floor" on first load. **Resolved: retuned
          the example** -- see Round 4. The breach turned out to be a symptom of a
          real flaw in the scenario, not just a horizon that now reached far
          enough to see it.

Round 4 (Luke, testing locally)
-------------------------------
    - [x] "Accounts at <date>" groups by kind -- Loans, then Savings, then
          Everyday -- with headings, keeping config order inside each group. No
          headings when a budget only has one kind; they'd label nothing.
    - [x] The chart actually auto-selects the account that breaches its floor.
          The badge beside the picker has always said "auto-selected -- hit its
          floor", but nothing ever did the selecting: you only saw it if you
          happened to pick that account yourself. Your own choice is never
          overridden afterwards, and the badge no longer claims credit for a
          choice you made.
    - [x] Retuned example.yaml. The house wasn't paid off until 2047, twelve
          years after retiring in 2035, so "mortgage freed-up saving" switched on
          during retirement and shovelled drawn-down super into the retirement
          fund forever -- super reached -1.1M and early retirement 2M. The plan
          now pays the house off at 52 while both are still working, and "retire
          at 55" explicitly stops that saving. Also added a bills envelope and a
          travel envelope, gave the household super balances and contributions
          that match its income, and sized every drawdown against what's actually
          being spent. Nothing breaches over the full 60 years -- which also
          answers the open question above about the first-load warning.
    - [x] `fires()` no longer throws on a transfer with no day. A goal that stops
          a transfer an earlier goal was meant to have started, applied before
          that goal fires, builds one out of nothing but a name and an amount --
          an ordinary mistake to make in a real config, and it took the whole
          page down. Pre-existing; the retuned example is just what exposed it.
    - [x] A regression test that the shipped example survives the round-trip the
          UI actually uses (state -> YAML -> load), which is the path neither the
          console tool nor any other test was covering.
    - [x] Example cut down to one person, and income that doesn't escalate.
          Spending rises with inflation and pay doesn't, so the working years get
          tighter rather than easier -- which is both closer to how pay actually
          behaves and a much harder test of whether the plan holds. Retuned around
          it: smaller mortgage so the payoff lands at 52 with four years of
          redirection before retiring, and a bridge sized so the fund is spent by
          60 rather than left to compound into a second climb.

Round 5 (Luke, testing locally)
-------------------------------
    - [x] The account dropdown on the bottom transfer row was cut off by the pane
          it sits in. `overflow-x: auto` computes `overflow-y` to `auto` as well,
          so the scroll container clipped an absolutely-positioned child in both
          directions. The list is `position: fixed` now, placed against the
          input's own rectangle by combo.ts, flipping above when there's no room
          below, and following the input when the pane scrolls.
    - [x] The inflation checkbox inside a goal turned out to already override per
          goal -- Luke assumed it was inherited from the Transfers section.
          Confirmed with a test (6107 vs 5000 over five years at 10% inflation),
          kept the behaviour, and gave it a label that says so.
    - [x] Removed the now-empty `.more` spans and their CSS, left over from the
          ellipses Luke took out of index.html.
    - [x] Luke's own tuned config is the default scenario, shipped exactly as he
          exported it, at his explicit instruction.

          I first landed it with changes -- a super-drawdown fix he'd approved,
          plus two no-op overrides removed that I did *not* tell him about. The
          approved fix also had a consequence I described as pre-existing when it
          wasn't: freezing his bridge drawdown left the early-retirement fund
          unspent at 60, so it compounded to 703k instead of his 37,956. That is
          the shape he'd already objected to twice. Reverted; the file is his.

          Recorded for whoever picks this up, not as work to do -- it is Luke's
          scenario and his call: super ends at -7,080,930 because the super
          drawdown escalates while none of the spending it funds does. It
          under-funds the pay account at 60 ($3,250/month against $5,384 of
          spending) and then runs away to $19,153/month by 2086. The default also
          has no offset account, so `offsets` is no longer demonstrated by the
          worked example llms.txt hands to every AI.

Final follow-up (Luke, 2026-08-11)
-----------------------------------
    - [x] Replace `src/example.yaml` exactly with Luke's newer exported budget,
          then verify the shipped-example round-trip and production build. The
          export is the source of truth; do not retune or normalise it here.
    - [x] Fix goal overrides that only stop a transfer: they must neither display
          an inflation tick nor serialise an invented `escalation` value. Keep an
          absent override value absent so the engine inherits from the base
          transfer, and cover both the UI state and YAML round-trip.
