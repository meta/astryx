---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads input the same way everywhere:

- A damaged saved mode or base gets one repair from every command (show and compile offer the install and the base the file names, or every mode, as a change does).
- A comma between digits is read by the setting's domain: a decimal comma for `aspect-ratio 1,78` (1.78), corners, vibrancy and a spacing scale; a thousands mark in a pixel length (`1,200px` is 1200px).
- A setting pasted as `show --json` or `set --json` prints it (with `parts` or `note`), or as a one-entry list, is read as one setting.
- `undo t corners padding` gives one undo for each setting it names.
- A command line built from a mistyped or empty option is checked by its command before it is offered, and an empty option that narrows a change (`--on`, `--mode`, …) is never dropped from it.
- `new` reads a comma value as a light and dark pair for a color dial only, keeps its other repairs when its base is misspelled, keeps the base for a name that reads as one (`new Neutral`), names a path by its last part, offers each mode it cannot tell, and labels a base install as a step before its line.
- A saved state in other letters (`Hover`, `:hover`) and a dial saved for one mode are read as the editor reads them.
- A part typo is matched against the part words too (`--on sidebr` is the side nav).
- A comma `rgb()`/`hsl()` CSS does not take (`hsl(0, 100, 50)`) is refused with the syntax CSS reads (`hsl(0 100 50)`).
- An unknown word before a colon in a value (`colr: red`) is never taken off and offered as the value.

@josephfarina
