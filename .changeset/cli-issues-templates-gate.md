---
'@astryxdesign/cli': patch
---

[perf] When no loaded integration ships templates, the integration-issue check no longer imports every Core template doc. `astryx doctor` in a project whose integrations only ship icon sets now imports none of them.

@vjeux
