---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` follows the project's tsconfig path aliases when it checks that a theme's stylesheet is imported, so an import through an alias (`@/astryx-themes`) counts, and a stylesheet that is not imported anywhere is reported where it was missed before.

@josephfarina
