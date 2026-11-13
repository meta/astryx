---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme file that is a folder or cannot be read (its settings, source, stylesheet, module or undo history) is named with what is wrong and `ls -la <file>`, instead of a crash or "damaged"/"not valid JSON"; no message suggests deleting a file (a damaged history is moved out of the theme folder instead). `./t` and `.\t` name the theme `t`. A mode or base written in other letters (`Dark-Only`, `Neutral`) is offered back fixed, and a base is suggested only when it is installed. A missing argument names what the command takes and what it was given (`set corners small` reads `corners` as the theme), with its usage and `--help`.

@josephfarina
