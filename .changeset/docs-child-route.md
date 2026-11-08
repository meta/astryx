---
'@astryxdesign/cli': patch
---

[feat] `astryx docs` also opens a docs-tree node by its bare name, or by a route that drops the prefix its name repeats, when exactly one node matches: `astryx docs tokens-color` and `astryx docs tokens/color` both open `tokens/tokens-color`. Two or more nodes answering one name still fail with the suggestions they always listed, and an experimental doc still opens only by its marked route.

@josephfarina
