---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: per-mode part colors with commas, both-mode values and every `color()` space.

- A part color set for one mode, then the other, keeps a color that holds commas (`rgb(0, 0, 255)`) whole, in either order.
- A value that already gives both modes (`light-dark(…)`) is refused with `--mode`; drop `--mode`.
- The color dials read every `color()` space CSS has: rec2020, a98-rgb, prophoto-rgb and xyz, as well as srgb and display-p3.

@josephfarina
