# UX feedback round 4 — overrides and YAML editing

Objective
---------
Make goal overrides faithfully describe the YAML they inherit from, make account
choices usable within goals, and make raw-YAML edits visibly apply, rerun, and
update the share URL.

Tasks
-----

- [x] Let each checked goal-override field remain absent from YAML and show a muted
      inherited-value placeholder instead; only an explicitly entered zero amount
      gets a stopped marker, and omitted inflation keeps inheriting its rate.
- [x] Make From/To account choices in goal overrides usable, including selecting an
      account from a page-level overlay that cannot sit beneath later goal rows.
- [x] Restore the slim bookmark-URL-changed notice whenever an edit updates the
      share URL, including raw-YAML edits.
- [x] Show the raw-YAML editor before the still-visible simulation; apply valid edits
      live after a short debounce, retain the last successful simulation on invalid
      YAML, and show the validation error beside the editor.
- [x] Add regression coverage for inherited goal overrides, goal account choices,
      URL notice behaviour, and raw-YAML application.

Decisions
---------

- A partial goal override uses blank, muted inherited-value placeholders rather than
  copying the current fields into YAML. An untouched field stays absent and follows
  the live transfer, including its inflation setting.
- The slim top notice remains non-blocking, but restarts on each edit so it can
  actually be noticed after a series of changes.
- Raw YAML applies live after a short debounce; invalid text remains editable while
  the last valid state and simulation stay visible, with an inline error explaining
  why it has not applied.
- Account suggestions are promoted to a document-level overlay, avoiding the
  stacking and clipping traps of nested goal-row controls.
- No in-app browser was available for an interactive layering check; code-level
  coverage verifies the page-level overlay and the author will confirm the visual
  result from the PR preview.

Out of scope
------------

- Changing simulation maths, inflation calculations, or the YAML schema.
- Replacing the existing structured editor or adding account-management features.
