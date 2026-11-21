---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a negated state (`--state unpressed`, `--state 'not pressed'`, `--state unchecked`) is read as the part at rest. The refusal offers the same line with no `--state`, instead of the state the word denies (`--state isPressed`), which saved the pressed look when the rest look was asked for.

@josephfarina
