---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` look for a component's doc only in the Core folders whose listing holds its name, not in every folder. A search makes about a quarter of the file checks it made before. Results are unchanged.

@vjeux
