---
'@astryxdesign/cli': patch
---

[fix] No public API function takes an undocumented `__`-prefixed option. `themeBuild()` reads only its documented `out`, `check`, and `iconsSpecifier` options; what `theme build` hands a batch, family, or package-check build now travels through the CLI's own internal path, so `theme build` and `integration pack-check` behave and print exactly as before. A test fails if a hidden option comes back on any exported function.

@josephfarina
