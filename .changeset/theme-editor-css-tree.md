---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads CSS from one source instead of its own lists. Property names and value grammar now come from css-tree. The neutral color's shades come from the shipped Neutral theme, and system fonts from the list `astryx theme build` already uses.

- Six newer standard properties (`timeline-trigger-range` and its relatives) are accepted. An outline style in capitals (`SOLID`) is accepted.

@josephfarina
