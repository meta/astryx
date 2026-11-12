---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: weights on phones, and values read as CSS reads them.

- Heading and text weights (the `headings` weight dial, `--text-*-weight` tokens) now apply on phones too: they are written into the phone rules the base theme sets, as font families are.
- A token set to `var(--x, <fallback>)` checks the fallback as the token's own kind.
- Size tokens and color channels read numbers as CSS does: `1.px` and `rgb(255. 0 0)` are refused (with `1px` suggested where that is all), and `+4px` and `4e+1px` are taken.
- `vibrancy` suggests the value meant (`MORE` is more, `70%` and `7e1` are 70), and no value when the theme has no color to saturate.
- The `headings` result lists its weights in words, not `[object Object]`.
- The whole-theme and role `font` take a family alone: a size, a weight or a whole CSS font value is refused with the family, and the base size or headings command where it applies.

@josephfarina
