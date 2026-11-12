---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every suggestion a refusal gives runs and does what it says. `undo t Corners` reads the setting name in any case, and a near name (`undo t corner`) suggests `undo t corners`, never a bare `undo t` that would step back another change. A hand-edited setting suggests a value to set only for a token whose value has the wrong type. A flag given twice suggests its first value that the flag takes (`--like neutral`, `--corners small`, `--section actions`, and for a color dial the first that is a color: `--accent banana --accent red` suggests `--accent red`), or drops it. A folder of your own files suggests a free, valid theme name (`u-2`). After damaged or lost settings, the note says `undo` steps back to the settings from before the last change, and that the last change itself is not kept. A corrected `new` keeps every other option given, with `--like` in another case read as the built-in theme it names.

@josephfarina
