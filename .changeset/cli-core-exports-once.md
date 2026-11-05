---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` read Core's exports map once per run, not once per component. With the other readers, a search now reads Core's package.json 10 times instead of 183. Results are unchanged.

@vjeux
