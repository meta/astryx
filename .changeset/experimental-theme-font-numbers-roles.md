---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … font`: a number after a family the editor knows is read as CSS reads it, a weight from 1 to 1000 (`Inter 450.5`, `Inter 50`) and any other number no family (`Inter 1500`), never saved as a family of that name; a word with another first letter is no typo of a weight word (`Inter Night`, `Inter Right` are kept); and a font role in other letters (`--on Body`) is answered as that role, never as the app shell.

@josephfarina
