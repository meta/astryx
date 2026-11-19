---
'@astryxdesign/cli': patch
---

[fix] `astryx component <hook>` prints the hook's parameters, as `astryx hook <hook>` does: one line each in the default answer (name, type, default, required, and the description's first sentence) and the whole table at `--detail full`. The JSON is unchanged.

@josephfarina
