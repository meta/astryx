---
'@astryxdesign/cli': patch
---

[perf] The integration manifest writer loads the code-rewrite toolkit only when it patches a manifest. `astryx component`, `astryx theme list` and `astryx doctor` outside a project no longer load it, and a component lookup loads about 70 fewer modules.

@vjeux
