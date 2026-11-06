---
'@astryxdesign/cli': patch
---

[fix] A docs child named without its namespace now opens, when exactly one child answers to that name: `astryx docs tokens-color` and `astryx docs tokens/color` both open `tokens/tokens-color`, the route the stuttering child name makes. Two or more children answering one name still fail with the suggestions they always listed.

@josephfarina
