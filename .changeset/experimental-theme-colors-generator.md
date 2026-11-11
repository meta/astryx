---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: colors are generated the way the official themes are.

- An exact color you give stays exactly as given. In light it never moves: when no text reads on it, the text changes, and a pale fill that does not stand out from the page is reported. In dark it is kept too when text on it reads at 4.5:1 and it stands out from the dark page at 3:1, so the dark shades around it follow it; otherwise dark mode starts at shade 70, as the official themes do, and the result says why. A dark side never uses a light shade.
- `set <theme> neutral <color>`: your exact color sits at its own shade in light and dark, and the shades around it follow it.
- Text on accent and status fills comes from the neutral color's white or near-black (near-black first on warning), or pure black or white without a neutral color. Status tints are see-through in dark, and their text is measured over the surface; the accent tint is dark shade 30, or the nearest darker shade that citation text reads on; a tint is never the fill's own shade.
- An exact `--color-accent` (or another main color token) wins over the color it would replace: the text on it is picked to read on your color, the focus ring keeps following it, a pale one is reported, and the result says so.
- Text, icons and the focus ring take the nearest shade that reads, lighter or darker, so bases with dark light-mode surfaces get readable colors too.
- Hand edits to `palette.config.json` are kept: your own anchors, names, `kind`, `neutralProfile`, vibrancy written by hand, and colors of your own. One-mode themes generate one mode. A stop layout maps by its own shades, half stops included; one without black and white, with too few shades or with a wide gap is refused. Fields the generator does not read are named. What the editor replaced is named when a color change touches the config.
- A hand-edited generated color file is never overwritten, receipt or not; formatting is not an edit. Only color changes wait, and the refusal says how to keep or discard the edit; other changes go ahead. A file from another generator version is generated again. No unresolved color ever reaches the built CSS.
- The theme imports only the shades it uses, from `tokens/<theme>.palette-refs.ts`.
- Colors are read as browsers read them: negative hues, out-of-range saturation and chroma, `color(srgb …)` and `color(display-p3 …)`. Malformed functions, system colors and see-through colors are refused with the reason and a command that works, such as the color with its `#`, without quotes, opaque, or the nearest color name. A dial named another way (`gray`, `brand`, `error`, `saturation`, `Accent`) suggests the dial; a color dial with `--on` suggests what the part really reads.
- `vibrancy more` at 100 and `less` at 0 are refused, a number out of range suggests the nearest one, undoing the last color removes vibrancy too, a vibrancy edited by hand into something invalid can be fixed with `undo` or `set`, and a replaced color shows what it was. A wide-gamut color says it is used as its nearest sRGB color.

@josephfarina
