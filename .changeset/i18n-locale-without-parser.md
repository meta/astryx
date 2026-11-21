---
'@astryxdesign/core': patch
---

[perf] Reading the locale or direction with `useLocale`, `useDirection` or `useCollator` no longer loads the message parser: `useLocale` alone bundles to 441 bytes gzip instead of 10,250. A page that translates any Astryx string still loads the parser, as before. Translation output, with or without a provider, is unchanged for copies of one Core version.

@nynexman4464
