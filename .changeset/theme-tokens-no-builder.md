---
'@astryxdesign/core': patch
---

[perf] An app that imports only `@astryxdesign/core/theme/tokens` no longer loads the theme builder (`defineTheme` and the modules that only it loads) when its build keeps whole modules. Token resolution now reads the token defaults from their own module. Every resolved token stays the same. No API changes.

@vjeux
