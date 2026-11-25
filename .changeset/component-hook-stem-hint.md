---
'@astryxdesign/cli': patch
---

[fix] When `astryx component <Name>` finds nothing and a run of the name's words is a hook's name without its verb, the error suggests that hook: `astryx component TopLayer` suggests `astryx hook useLayer`, and `astryx component Reorderable` suggests `astryx hook createReorderable`. The longest such run wins, and a suggested component whose name carries those words stays ahead of the hint.

@josephfarina
