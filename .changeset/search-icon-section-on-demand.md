---
'@astryxdesign/cli': patch
---

[perf] `astryx search` loads its icon-section code only where icon features are on, so a search in a project without them no longer loads it. Each such search is about 6–8 ms faster, and every answer is unchanged.

@josephfarina
