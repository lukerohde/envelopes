# Mobile account-name/type-description readability

## Objective

On narrow screens the account list row showed the account name crammed next
to a short kind label, and names were force-elided (`white-space: nowrap` +
`text-overflow: ellipsis`) so a long name couldn't be read. The account kind
description (e.g. "Sinking fund (saves up, spends down)") is the part that
tells you what the account is *for* — it needs to be legible on mobile, not
cut off.

This change gives each mobile account row a clean two-line layout: account
name top-left with the balance top-right, and the full kind description
underneath on its own full-width line. Names now wrap instead of truncating.

## Tasks

- [x] Make the mobile account summary a two-column grid (name | balance)
- [x] Put the kind description on its own full-width row below the name
- [x] Let account names wrap instead of ellipsis-truncating
- [x] Verify at 375px (iPhone) in a real Chromium: name+balance aligned on
      one row, kind readable and not clipped, long names wrap
- [x] Verify desktop (>= 700px) is untouched
- [x] Run the full test suite, tsc, and a production build

## Decisions

- **Explicit two-axis placement, not auto-placement.** Sparse auto-placement
  never backtracks: with name auto, kind `grid-column: 1 / -1`, and balance
  auto, the balance strands on a third row — and even `grid-column: 2` alone
  on the balance (auto row) still lands on row 3 because the cursor is at
  row 2 after the full-width kind. Every span gets explicit `grid-row` +
  `grid-column` (name 1/1, balance 1/2, kind 2/1–-1). Verified with a
  spec-faithful simulation of the §8.5 algorithm and confirmed in Chromium.
- **CSS-only, inside the existing `@media (max-width: 699px)` block.** No
  markup or JS changes; desktop keeps the table.
- **`margin-left: auto` and `flex` leftovers on the balance stay** — inert
  in grid, not worth churn.

## Out of scope

- Type descriptions on **desktop** (the table already shows kind labels).
- Wording of the kind descriptions themselves.
- Transfer rows and person rows (they use flex and were not part of the ask).