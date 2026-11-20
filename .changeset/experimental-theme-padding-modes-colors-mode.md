---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: per-variant colors in one mode, hover on every variant, later longhands, nested cards and kept sizes.

- A one-mode color (`--mode`, or any color in a `light-only` or `dark-only` theme) on a part whose variants each have their own (a button or card background, a badge's text) goes to each variant's own rule, with the other mode's half exactly what that variant showed there (the base theme's value, else Core's; transparent stays transparent), so the other mode is unchanged for every variant; a variant's own hover still shows.
- A whole-part hover background (`--state hover`) reaches every variant, including ones the base theme gives their own hover or resting color.
- A longhand set after a shorthand wins even where the base theme holds that longhand (`padding-inline` after `padding`, `border-color` after `border`).
- A plain card inside a variant card keeps the card padding the editor gives it, in each text direction, and a variant's own padding (from the settings or your own source) no longer leaks into it; a variant your own source pads keeps its padding after an unequal editor padding on the plain card.
- The spacing dial keeps every exact control size the theme keeps (in px, rem or calc, from your own source, or set on the part) in order, on a part too; a size with no room between two kept ones takes the smaller one's size, and the result says so.
- `--mode` refused on a border names the variant in the per-mode color step; a gradient is offered as written for both modes.
- With your own source setting one corner, the corners note says the dial shows on the other corners after the undo.

@josephfarina
