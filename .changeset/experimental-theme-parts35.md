---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one padding model for parts whose box reads Core's padding variables.

- On card, clickable-card, selectable-card, dialog, drawer, bottom-sheet, section and number-input, each part's padding is worked out per variant and per state from every padding setting in the order made, side by side for each text direction (a physical left is the start in a left-to-right box and the end in a right-to-left one; so is the `padding` shorthand's left), and written to the variables the box reads. The later setting wins in both directions, a variant or a state out-ranks the base, and the content that reaches the box's edges stays in line.
- A clickable or selectable card is padded as a card.
- A part's base rules come before its variants', and its rules for a direction before its states', whatever order the settings were made in.
- `padding` on chat-composer takes one length, as Core reads it inside calc(): a length, a variable such as `var(--spacing-3)` (Core's own default), or `calc()`, `min()`, `max()` or `clamp()` giving one. Several values, a bare number or a percentage is refused with one that works.

@josephfarina
