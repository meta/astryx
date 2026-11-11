---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: questions read the way people write them.

- Negation and "too" read the right way round: "shouldn't", "turn off", "never", "stop", "unbold", "too sharp" (rounder) and "too heavy" (lighter). "Everything except X", "but not in X" and "all but X" keep X as it is now. "Without" is read in the shipped languages, and "sans" means a typeface only before serif or font.
- A typed value always wins. A hex beats a color word. A hex with the wrong number of digits is refused by name and never replaced with a sample. The sign, multi-value padding, `%` opacity, `em` tracking, numeric weights, written-out shadows and "40px tall" are kept. No color is picked when the question gives none.
- "In dark mode" carries `--mode dark` to every color command, parts included. A change that is the same in both modes, or a dark-mode ask on a light-only theme, says so instead of changing light.
- Better parts and properties: side nav items, focus rings as outlines, tab underlines, icons, border colors (darker, subtler, contrast), the overlay, transparent backgrounds, progress bar thickness, smaller headings, underlines, line height and body weight. A question about what something is ("what does --color-accent do") gets the lookup.
- Typos with swapped letters and short forms (`bttn`, `brdr`) are corrected. Portuguese, Italian and Korean words for buttons and rounded are read.
- Sequences drop repeated and overwritten steps and stop at 12. Two asks that contradict each other are offered as choices, not run in turn. Changes come before lookups.
- Text output prints each command on its own line and never wraps one. A sequence prints as one line.
- `--theme ""` and a repeated `--theme` are refused, for every subject. The default theme is the one an editor command changed last, not the newest settings file, and `themeChosenBy` says how it was picked.
- Pictures: every pixel is read up to 4 million, so 1-pixel lines count. tRNS is honored for gray and RGB pictures. A 0x0 picture names its size. 16-bit pictures are capped at 20 million pixels.
- Parallel lookups in an app with no themes leave no empty `themes/` folder. A refusal's commands start the same way as the answer's.

@josephfarina
