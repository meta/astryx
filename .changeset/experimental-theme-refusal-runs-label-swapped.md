---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` offers lines that run and do what they say:

- A setting and value in the other order beside a mistyped option (`set t red --color-accent --mdoe dark`), or with a spaced name beside a part typo, get one line with both repairs.
- A `var()` naming a token one letter off gets the line with the token repaired, typed and as the repair of a saved entry beside its undo.
- `undo` naming two settings of different scopes (`undo t spacing background-color --on card`) offers one undo for each, never one that drops the other.
- After a plain part fill, the "to fill only one of them" and "to change only its fill at rest" lines start with the undo of that fill.
- `new --base` offers the `--like` line as `new` checks it (an install first, other flags repaired). `new --font Open Sans` with no name reads Sans as part of the font, and offers a free name. `--mode light --mode dark` together read as both modes.
- The editor's own lines pasted back keep their repairs in the arrow form (`accent tomato -> tomatoe`), read a mode label in any case or with `mode`/`only` (`(Dark)`, `[dark only]`), refuse a mode typo with its line, and keep a printed scope in another case (`on Card`, `:Hover`).
- A pasted entry's field keys are read in any case (`{"Thing": …, "Value": …}`, `"On"`).
- The line that drops `--only` keeps every other scope flag.

@josephfarina
