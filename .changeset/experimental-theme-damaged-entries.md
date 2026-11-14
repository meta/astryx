---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a settings entry whose mode is written in other words (`Dark`, `night`, `Light`, `day`) is read as dark or light, and one whose source is written in other letters (`Dial`) or missing is read from the thing (a dial, a `--` token, a part property). A note says how each was read, and the next change saves it that way, so no command is blocked. An entry whose mode or source means nothing is refused with the undo that removes only that entry first, and the step back, which loses the last change, second. When a theme name is typed as a path (`./t`, `themes/t`), the `set`, `undo` and `compile` with the theme's name is checked by that command before it is offered, with every repair in the one line; an `--out` outside the working folder is dropped, and the reason says why.

@josephfarina
