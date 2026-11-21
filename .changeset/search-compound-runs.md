---
'@astryxdesign/cli': patch
---

[perf] `astryx build` and long `astryx search` queries read compound names faster: for each entry, only the runs of adjacent query words that can name it are compared with it. They are found by looking up the entry's joined names, their plurals and starts, the stretches of their words, and its one-word keywords. Results are unchanged.

@josephfarina
