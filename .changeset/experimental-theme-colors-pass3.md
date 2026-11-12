---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: colors and fonts that stay safe and say what they do.

- Undo never deletes the generated color file (`tokens/<theme>.palette.ts`) when you edited it by hand. The file stays, and the result names it. The theme reads only the selected-shades file (`tokens/<theme>.palette-refs.ts`), which the editor writes from the generator on every change, so a hand edit to the palette file never shows; the result says so.
- A focus color (`--focus-outline-color`) or any other color token set for one mode no longer locks the theme. Every later command checks it as the color it is.
- A color file counts as edited only when its colors differ. Formatting, a byte order mark, semicolons or a hand edit to `palette.config.json` without a receipt do not count. When an edit blocks a color change, the refusal says how to keep or discard it and names the command to run next.
- An exact main color (`--color-accent` and the other fills, tints and on-colors) reports what it changes around it, including the light-page check, when you set it.
- The accent tint stays at the official shade. Secondary text on the parts that sit on it (selected items and rows, a dropzone, numbered citations) and on segmented-control labels (which sit on the neutral track) is lifted, as the official Neutral theme lifts it, to the nearest gray that reads at 4.5:1 there and under a hover: the neutral color's shades, else grays grown from the base theme's own secondary text, so every accent gets it. An exact `--color-text-secondary`, for the whole theme or on one of those parts, wins there, per mode. The contrast check measures those parts with the text they show, at 4.5:1.
- On a base whose light page is dark (Gothic), the colors take the shades meant for a dark page in light mode too, so text reads on it. See-through exact colors (a hover tint, a fill) are measured as they show over the surface.
- On a layout without shade 85, the light accent tint takes the lighter neighbor. Shades are shown rounded.
- `font inherit` and the other CSS keywords are refused, because the browser would drop the whole font. Generic families (`serif`, `system-ui`) and the usual desktop fonts (Arial, Segoe UI) count as system fonts, and the fallback never repeats the family. A family name that is not a plain CSS name (`3Dumb`, `My/Font`) is quoted, and `@fontsource/<font>` names its preset.

@josephfarina
