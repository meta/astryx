---
'@astryxdesign/core': patch
---

[perf] Button, Icon: defer the touch hit-area runtime until after first paint and load default fallback icons only when no theme or global registration provides the requested name, reducing first-load JavaScript for consumers (#12018).

@Geervan

