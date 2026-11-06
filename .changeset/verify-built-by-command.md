---
'@astryxdesign/cli': patch
---

[fix] `astryx integration verify` no longer reports `theme_module_stale` for a theme whose built module differs only in the command its comment says built it, such as a theme built with `yarn astryx` and verified where `pnpm exec astryx` runs. Any other difference still fails.
@josephfarina
