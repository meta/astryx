---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: fallbacks, saved font dials and size suggestions.

- A part value's `var()` fallbacks are checked against the property (`padding 'var(--nope, red)'` is refused), as token fallbacks are.
- A saved `font` dial that `set` would refuse (a CSS keyword such as `inherit`, a size, a whole CSS font value) is reported with the commands that fix it, and never built.
- A size one slip from a valid one suggests that size: `16 px` and `16pxx` suggest `16px`, `1,5rem` suggests `1.5rem`. `text-size` suggests the nearest size it takes: `20 px` and `125%` are 20, and a size past either end is that end.

@josephfarina
