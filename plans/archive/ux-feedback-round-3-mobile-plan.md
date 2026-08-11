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
- [x] Show each person's name beside their age, with an Edit control that opens the
      person in the structured editor.
- [x] Reduce the bookmark-changed warning to a slim, top-pinned notice.
- [x] Add the example's final `Old & broke` goal: super reaching $1,000, producing
      a milestone at retirement age.
- [x] Include the pending homepage wording fix in the finished change.
- [x] Default the time slider to the earlier of the final completed milestone and
      first floor hit whenever the simulation redraws.
- [x] Describe the simulation horizon as the youngest person's ending age instead
      of a raw number of years.
- [x] Show the simulation end date and every person's age at that date in the
      heading, and capitalise the example person's name.
- [x] Use the existing compact `Name age` format for ages in the simulation heading.
- [x] Put simulation-heading ages on a second line and remove the duplicate end date.
- [x] Waived at the author's request: verify at a phone viewport in light and dark
      themes, including transfers, goals, accounts, and simulation recomputation
      after editing an expanded row.

Decisions
---------

- Mobile summaries lead with the identifying name and the amount/cadence a user
  usually wants to scan; From/To and the remaining fields stay in the expanded
  editor rather than being squeezed into unreadable columns.
- The underlying row renderer and state model remain shared. Mobile changes are a
  presentation and interaction layer, not a second YAML or simulation path.
- Expansion is per row, so opening one transfer or override does not make the whole
  section tall or push unrelated rows out of view.
- The People’s Ages panel stays compact until its Edit control reveals that person's
  existing name and birthday fields inline; it does not add a separate data path.
- A simulation redraw starts at the earlier of the final milestone and first floor
  hit, so the first projected endpoint is visible without dragging the time slider.
- The simulation heading uses the actual endpoint and lists every person's age,
  because the horizon can be adjusted after the initial age-100 default.
- Simulation-heading ages use the same muted, second-line treatment as milestone ages.
- The in-app browser was unavailable in this session, so the author explicitly
  waived the final manual viewport check before archiving.

Out of scope
------------

- Redesigning the simulation chart or timeline beyond checking that the existing
  mobile layout still fits.
- Changing the budget schema, engine maths, defaults, or desktop table proportions.
- Persisting expanded/collapsed state in the share URL or local storage.
