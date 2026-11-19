---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor undo`: the headline names what the undo took back (`[ok] v: undid neutral = #78716c (whole theme)`, or `undid 2 changes: …`), in the text and in the JSON (`undid`), so a tail of the output keeps it. When the last change command was refused, the undo says that command changed nothing, so it took back the change before it (`refusedBefore`).

@josephfarina
