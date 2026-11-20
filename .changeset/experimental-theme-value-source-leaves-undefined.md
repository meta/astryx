---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a value your `<theme>.theme.ts` leaves `undefined` is taken as not set wherever it is (a token on the page, in `onDark`/`onLight` or in an adaptation rule, a part, a style key, a property), now that the theme build writes nothing for it. A part given `null` (or another value that is no block of style keys) is refused at its line, at the root and in `onDark`/`onLight`, instead of failing the build.

@josephfarina
