---
'@astryxdesign/cli': patch
---

[fix] `astryx theme add <slug> --no-fonts` records an intentional system-font fallback, leaves that theme's font stylesheet out of the generated module, and lets `astryx doctor` report the choice as passing. Later theme commands preserve the recorded choice.

@josephfarina
