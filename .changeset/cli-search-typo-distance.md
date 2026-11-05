---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` compute a typo's edit distance only up to the most edits that can count. A fuzzy match now computes far fewer table cells, with unchanged answers.

@vjeux
