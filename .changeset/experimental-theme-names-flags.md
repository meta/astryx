---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a settings entry's `only` written as text (`"false"`, `"true"`) is read as what it says, with a note, and any other value that is not true is refused with the undo that removes that entry, so `show` and the build never disagree. A theme typed after the setting (`set --color-accent '#123457' t`) is refused with the same `set` or `undo` with the theme first, never a `new` of the setting's name. `undo <theme> vibrancy` says the default vibrancy applies now. `new` with several bad dial flags suggests one command that fixes or drops each of them; `new --base` points to `--like`; `show` names a show that works and its help for an option it does not take. The name rule lists every reserved name it refuses (com0-com9, lpt0-lpt9, and com¹-com³, lpt¹-lpt³). corners takes a rem (saved in px), and a bare number gets the px line. Dial words are read in any case (ROOMY, MORE, BOTH). `set t 'corners pill'` is read as the thing and its value. With no theme named in an app with one theme, show and undo name that theme. The compile line in the result works from the folder the command ran in.

@josephfarina
