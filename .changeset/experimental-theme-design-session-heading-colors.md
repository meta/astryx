---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: heading colors, the page background, gradients per mode, and background values with many variables.

- `color … --on heading` (also per level with `--when level:N`) is written as the text color tokens the heading's color prop reads, on headings only, so it shows; `how` answers "headings in the accent color" with it.
- The page behind your parts is painted by `app-shell`: `--on page` (or `body`) is refused with the `app-shell` command, and `how "page background"` offers `--color-background-body` for a color and `background … --on app-shell` for a color or a gradient. Setting `--color-background-body` no longer says it changes nothing where Core's own page styles read it.
- A gradient background can differ between light and dark: `background '<gradient>' --mode dark` paints each of its colors in that mode only, beside the other mode's layers.
- A background value with more than three variables (`color-mix()` with `var()` and a stop position, layered dots) is read as CSS, as the same value with plain colors is.

@josephfarina
