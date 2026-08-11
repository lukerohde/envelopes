# Mobile editing — compact rows with expandable fields

Objective
---------
Make the budget editor comfortable on a phone-sized viewport. The desktop grids
remain unchanged; on narrow screens, each table row becomes a compact summary and
opens a small, full-width editor for its actual values. Nothing in the YAML schema,
simulation engine, or desktop interaction changes.

Tasks
-----

- [x] Add a mobile summary/editor interaction for transfer rows: show the transfer
      name plus a compact amount/cadence summary, with an explicit expand/collapse
      control for From, To, Amount, Every, On, and Inflation.
- [x] Apply the same pattern to goal transfer overrides, retaining the override
      checkbox and stopped marker in the summary and keeping the full override
      fields available when expanded.
- [x] Make account rows usable without horizontal scrolling: show name, kind, and
      balance in the summary, with the remaining account fields in the expandable
      editor.
- [x] Keep desktop table headings and grid layout unchanged above the mobile
      breakpoint; choose a breakpoint based on the existing card width rather than
      device-specific user-agent checks.
- [x] Ensure keyboard and screen-reader access: the expand control is a real button
      or details summary, has an accessible label, and preserves focus across a
      re-render.
- [x] Add regression coverage for compact transfer markup and account summaries;
      the shared field wiring remains the same path as desktop.
- [x] Start newly added rows in edit mode, with the name field focused and mobile
      account/transfer editors expanded immediately.
- [x] Make a goal's Edit action use the same pill treatment as other row editors,
      and use the shared bin glyph for deletion while the goal is open.
- [x] Ask for confirmation before any bin deletes a row.
- [ ] Verify at a phone viewport in light and dark themes, including transfers,
      goals, accounts, and simulation recomputation after editing an expanded row.

Decisions
---------

- Mobile summaries lead with the identifying name and the amount/cadence a user
  usually wants to scan; From/To and the remaining fields stay in the expanded
  editor rather than being squeezed into unreadable columns.
- The underlying row renderer and state model remain shared. Mobile changes are a
  presentation and interaction layer, not a second YAML or simulation path.
- Expansion is per row, so opening one transfer or override does not make the whole
  section tall or push unrelated rows out of view.

Out of scope
------------

- Redesigning the simulation chart or timeline beyond checking that the existing
  mobile layout still fits.
- Changing the budget schema, engine maths, defaults, or desktop table proportions.
- Persisting expanded/collapsed state in the share URL or local storage.
