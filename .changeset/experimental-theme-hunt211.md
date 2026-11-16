---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `--when` or `--state` typo, or another case, on a group (`--on inputs --when status:eror`, `--on checks --state chekced`) gets the corrected command, read against what the group's members have between them, as the same typo on one part does. A setting's name typed where the theme goes gets a command on the theme here (`show accent` offers `show t`, `set corners pill` offers `set t corners pill`, `undo corners` that no theme holds offers `show t`), never a theme of the setting's name; `undo t accent corners spacing` reads the bare words as a list; and an unknown subcommand followed by an option (`experimental theme preview path --theme t`) is named as the unknown subcommand, with the near ones.

@josephfarina
