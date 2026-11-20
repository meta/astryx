---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now moves ahead of a part from another run only when its own hits on the part's words have keyword strength (its whole name, its name's head word, or a keyword, also one edit away), not a word inside its name or a mention in its description or guidance. `astryx search router` and `astryx search "react router"` list LinkProvider first again, and `astryx search close` no longer lifts Dialog, which only its guidance links to closing, to second place; at the default limit a few such roots now fall out of the first 20. Matches, scores, reasons and counts are unchanged; `build` is unchanged.

@josephfarina
