---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a mistyped part (`nmber-input`) is read as the whole part name it is a typo of, never a group one word of it names, and a did-you-mean follows the one typo limit (a name that only holds the typed word inside it is none). A boolean option written with a value (`--only=true`, `--png=false`, `--only false`) gets the same reading in set, undo, new, how and show: the option takes no value, with the command that works. A dial and its value in the other order (`set t round corners`) lead with the set in the right order, and a theme typed last is offered first only in a line that works. undo names every entry of a setting listed twice by hand that it removes. A bad entry beside a good one of the same setting is named as listed twice, so its keep line keeps the good one, and a keep line whose value set refuses is not offered. A dial word saved in other letters (`Pill`) is that word, and a headings word saved under the other half is filed under its own. `only` on a setting that is no group member is refused with the undo of that entry. show writes a deleted palette.config.json again. A settings file that cannot be read is made again on the base it was built on, and `new --like` reads a base in any case.

@josephfarina
