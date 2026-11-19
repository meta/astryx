---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now moves ahead of a part from another score band or kind only when the root's own name or keywords answer the query, not a mention in its description. `astryx search router` and `astryx search "react router"` list LinkProvider first again. A query that types the root's own name, such as `astryx search "stack layout"`, no longer counts as a misspelled part name. The new order changes no match, score, reason or count; `build` is unchanged.

@josephfarina
