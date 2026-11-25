---
'@astryxdesign/cli': patch
---

[fix] A lookup that misses now suggests a component family that `astryx component <Name>` opens by its own doc, such as Chat. Before, `astryx docs Chat` listed every docs namespace; now it suggests `astryx component Chat`.

@josephfarina
