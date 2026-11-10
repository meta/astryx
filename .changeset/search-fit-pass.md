---
'@astryxdesign/cli': patch
---

[fix] `astryx search` puts the results that fit the whole query higher. The first result and the set of results stay the same. Below the first result, inside each group of equally strong matches, a result whose docs fit the query much worse than the others in its group moves after them; a result whose name spells two or more of the query's words never moves. The fit uses the same word-meaning weights `astryx build` uses to pick blocks, so a new component or template is placed from its own docs. A query that is an entry's whole name keeps its answer, and every `--limit` shows the top of the same answer.

@josephfarina
