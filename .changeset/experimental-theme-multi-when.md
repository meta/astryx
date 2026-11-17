---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` and `undo`: `--when` takes several conditions, one per prop (a ghost small button: `--when variant:ghost --when size:sm`, or `--when variant:ghost+size:sm`), written as one rule for parts that have all of them, as Core's `prop:value+prop:value` keys are. Each is checked as one alone is, the same prop twice is refused, and the conditions are saved in one order, so an undo finds them whatever order they were typed in.

@josephfarina
