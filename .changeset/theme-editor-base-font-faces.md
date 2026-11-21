---
'@astryxdesign/cli': patch
---

[experimental] The theme editor (`astryx experimental theme editor`) reads the families and weights a base theme loads from its font stylesheet's own `@font-face` rules, as the built-in themes now ship them, so it keeps the base's weight notes and does not suggest installing fonts the base already loads.

@josephfarina
