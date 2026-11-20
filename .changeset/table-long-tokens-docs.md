---
'@astryxdesign/core': patch
---

[docs] Table's docs say how a long token, such as a code identifier or a URL, wraps in a data-driven table: the columns you pass in `columns` are sized from their definitions, not their content, so a token wider than its column breaks inside the token. To keep tokens whole, give the column a floor that fits them with `proportional(1, {minWidth})` or `pixel()`, or compose the table in children mode, whose columns follow their content.

@josephfarina
