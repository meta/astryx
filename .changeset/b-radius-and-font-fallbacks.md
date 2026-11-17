---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, and `astryx experimental theme` refuses, a radius scale with no `base` or `multiplier`, or one that is no number. Core builds every scaled corner from it as NaNpx, which the browser drops.

In the editor:

- A family typed alone that the base theme already uses keeps the base's own fallbacks (Fraunces keeps Georgia and serif).
- Any other family typed alone gets fallbacks of the kind its name says (a Serif name serif ones, a Mono or Code name monospace ones), as the open fonts do.
- A family the base's font stylesheet loads is no longer also named as a font no package loads.

@josephfarina
