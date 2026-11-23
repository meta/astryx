---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads each clause of a question faster. The check that every word of a clause was read used to make every part-name pattern of the theme (more than 5,000), and the state-word patterns, again for each clause. It now makes them once for each theme, and skips a part-name pattern on a clause without that part's word. Answers do not change.

@josephfarina
