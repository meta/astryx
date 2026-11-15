---
'@astryxdesign/cli': patch
---

[feat] `astryx search` marks a template whose doc sets `isReady: false`: its text record marks its kind `(not ready)`, and its JSON result adds `isReady: false`. Search still lists it in the same place; every other result is unchanged.

@josephfarina
