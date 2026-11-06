---
'@astryxdesign/cli': patch
---

[perf] With no integration loaded, the integration-issue check no longer imports every Core template doc. `astryx discover`, and `astryx component` without `--showcase` or `--blocks`, now import none of them.

@vjeux
