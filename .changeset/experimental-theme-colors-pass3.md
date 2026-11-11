---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: colors and fonts that stay safe and say what they do.

- Undo never deletes a generated color file you edited by hand. The file stays, and the result names it.
- A focus color (`--focus-outline-color`) or any other color token set for one mode no longer locks the theme. Every later command checks it as the color it is.
- A color file counts as edited only when its colors differ. Formatting, a byte order mark, semicolons or a hand edit to `palette.config.json` without a receipt do not count. When an edit blocks a color change, the refusal says how to keep or discard it and names the command to run next.
- An exact main color (`--color-accent` and the other fills, tints and on-colors) reports what it changes around it, including the light-page check, when you set it.
- Citation text on the accent tint is measured against the same bar the tint is picked by: what the official Neutral theme ships. So the editor never reports its own pick on bases such as Gothic.
- On a layout without shade 85, the light accent tint takes the lighter neighbor. Shades are shown rounded.
- `font inherit` and the other CSS keywords are refused, because the browser would drop the whole font. Generic families (`serif`, `system-ui`) and the usual desktop fonts (Arial, Segoe UI) count as system fonts, and the fallback never repeats the family.

@josephfarina
