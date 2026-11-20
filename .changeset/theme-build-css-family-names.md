---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reads a font family name as CSS reads it (`Gill\ Sans` is Gill Sans), names as not loaded a family the theme holds in its own property and reads with `var()`, and builds a theme bound with `let` or `var` that is never assigned again as it builds a `const` (one assigned again is refused naming that, not as an icon registry it sets).

@josephfarina
