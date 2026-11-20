---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a `[light, dark]` pair with any half that is no color (a size, a duration, a word that is no color name), not sizes only, since `light-dark()` takes colors only. A value the build cannot place on a line of the theme file is named as computed in it, and the theme it extends is named only when it holds that very value.

@josephfarina
