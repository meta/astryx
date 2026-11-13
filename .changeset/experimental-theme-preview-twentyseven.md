---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: the route of a one-mode theme no longer imports the mode switch it does not draw, so apps with `noUnusedLocals` build. A refused `--theme` says exactly what leaving it out does in this app: the theme the preview keeps wearing, or the one theme under `themes/` it picks.

@josephfarina
