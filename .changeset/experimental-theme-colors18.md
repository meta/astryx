---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: when a part does not read the token named, the suggestions name only tokens of the same kind (a weight goes to a weight token, never to a size or a line height). A `var()` fallback is checked wherever it sits (inside `calc()`, `max()`, `color-mix()`), and an empty fallback on a typed token is refused. A size token given a bare number suggests that number in px (`16` → `16px`), and `text-size 20px`, `2e1`, `+20` and `1.25rem` suggest `text-size 20`.

@josephfarina
