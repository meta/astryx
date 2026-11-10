---
'@astryxdesign/cli': patch
---

[fix] `astryx search` puts the results that fit the whole query higher. The first result stays the same. At the default limit, and at any limit of 10 or more, the set of results stays the same. A smaller `--limit` shows the top of the new order, so it can show a different result. Below the first result, inside each group of equally strong matches, a result whose docs fit the query much worse than the others in its group moves after them. A result whose name spells two or more of the query's words never moves down; it can still move up. The fit uses the same word-meaning weights `astryx build` uses to pick blocks, so a new component or template is placed from its own docs. A query that is an entry's whole name keeps its answer.

@josephfarina
