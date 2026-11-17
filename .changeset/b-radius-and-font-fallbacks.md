---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, and `astryx experimental theme` refuses, a radius scale with no `base` or `multiplier`, or one Core cannot read as a number (a boolean is read as 1 or 0, so it builds). Core builds every scaled corner from it as NaNpx, which the browser drops. A radius of `0` or `''` is said too: Core skips it and builds no corner token, so the base theme's corners stay (`radius: {base: 0, multiplier: 1}` squares them).

In the editor:

- A family typed alone that the base theme already uses keeps the base's own fallbacks (Fraunces keeps Georgia and serif).
- Any other family typed alone gets fallbacks of the kind its name says (a Serif name serif ones, a Mono or Code name monospace ones), as the open fonts do.
- A family the base's font stylesheet loads is no longer also named as a font no package loads.

@josephfarina
