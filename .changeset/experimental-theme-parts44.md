---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one-mode colors per variant, the spacing dial around kept steps, and padding amounts from the base theme.

- A one-mode color on a part whose variants each have their own is written to each variant as the property it names (a card's `border-color` stays a border color), with each variant's own other half: an earlier setting for the other mode or for both modes, else what the variant shows unset. `--mode` on a color longhand such as `background-color` or `border-color` is accepted this way.
- A hover set as `background-color` stays on every variant after a later one-mode `background`, and a one-mode background after a plain one applies to every variant in both modes.
- A whole-part state setting that your own `<theme>.theme.ts` sets on the same state is not repeated on the variants, so it does not show anywhere, as the result says.
- The spacing dial keeps spacing steps in order around an exact step the theme keeps, reads a kept control size written as a token, `clamp()`, `min()` or `max()`, and keeps a part's own exact control size in order under a whole-theme dial.
- `how` padding amounts read the base theme's own block and inline padding on a part ("double the button padding" on butter gives `1rem 2rem`).

@josephfarina
