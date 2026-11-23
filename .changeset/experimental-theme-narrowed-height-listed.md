---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … --only` on one input leaves the inputs' other height on the other inputs as the group's height: the copies a narrowing writes are saved with `narrowed: true`, so they stay the group's height, which `show` lists and a later shared height replaces with the others. A height kept on one control with `--only` carries no mark and stays that control's own.

@josephfarina
