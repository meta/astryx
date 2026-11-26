---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> font-size <size> --on <part>` takes a text size for a part whose text is drawn by elements inside it that each read a text size token: the value goes into the token of its main text, the largest as the sizes resolve (a top nav heading's title, not its supporting line), on that part. The setting is saved as typed, so `undo` finds it, and the build writes only the token. Where no one main text can be told (a tie, sizes from the parts it holds, an icon sized by spacing, a value naming the token itself) it is refused as before; a text column's lines each still take it.

@josephfarina
