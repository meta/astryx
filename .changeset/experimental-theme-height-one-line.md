---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set min-height … --on <input>`, and a height set for a state (`--state hover`), now reach only the inputs drawn one line tall, as a plain height already did. A text area, which grows with its rows, keeps its own height, and the result of each of these, a plain height's too, names it with the line that sizes it too. A height saved by an earlier editor that reached the text area keeps it, so a theme rebuilds as it was saved, and the result names it with the line that gives the text area Core's own height again (`… revert-layer --on text-area --only`).

@josephfarina
