---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now moves ahead of a part from another run only when the root's own name or keywords answer the query, not a mention in its description or guidance. `astryx search router` and `astryx search "react router"` list LinkProvider first again, and `astryx search close` no longer lifts Dialog, which only its guidance links to closing, into the first results. The new order changes no match, score, reason or count; `build` is unchanged.

@josephfarina
