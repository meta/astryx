---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- a `--when status:<x>` setting now wins over the part's plain one-mode color whichever was set first: the variant blocks a plain color is written into come before every other condition, so an accepted status border always shows;
- `how` value questions read what the part draws: "what is the focus ring of inputs in dark mode" gives the ring it shows when focused (no longer the mode dial), "what color is the toast text" gives the color on the toast's own inverted surface, and "what is the shadow of cards" gives none at rest instead of the selected card's ring;
- "make all borders red in dark mode" gives every step: a line a part does not draw yet gets its color see-through in the other mode, so the whole answer runs.

@josephfarina
