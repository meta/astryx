---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor integration templates` and `astryx integration check` read only the Core template docs an integration template names. That is its own id or the one it replaces. Core's ids come from its files, so a check loads about 750 fewer modules.

@vjeux
