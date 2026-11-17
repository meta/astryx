---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … font`: families the editor knows written with no comma between them (`Georgia Verdana`) are refused with the list (`'Georgia, Verdana'`) and the name kept as typed in quotes, as the browser reads one family named that. A typo of a family with a weight or style word after it is read by the same font rule as the typo alone: `Georiga Bold` is refused with georgia and `headings bold`; `Arail Black`, near a font a system ships only, is kept as typed with the note.

@josephfarina
