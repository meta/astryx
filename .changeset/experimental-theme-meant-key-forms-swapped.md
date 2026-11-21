---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `new` reads more of what is typed after the name as settings, never name words: the base in the key forms (`like=neutral`, `like: neutral`), a value before its dial (`red accent`), a quoted pair or list (`'accent red, corners pill'`), a dial word with no value, and a word typed after an option's value that no reading takes (`--accent red foo` keeps `--accent red`; `--corners pill padding 8px` keeps `--corners pill` and offers `set … padding 8px`). Settings typed where the name goes (`new 'accent: red'`) stay on the free name offered, and two bases in one `--like` (`neutral,stone`) give the first built-in one. `like`, the word `show` prints for the base, points to `set <theme> base` / `undo <theme> base`. The theme typed as an option (`set --theme t accent red`) gets `set t accent red`, and a line set does not read is never offered as working. A theme with a setting pasted on (`show t=accent`) and a list of values where the theme goes (`show 'Inter, Arial'`) get a look at the theme, never a new one. A whole command pasted as one word (`set 'set t accent red'`) is read as that command. An undo by a held value with a scope typed (`undo t 8px --on cards`) leads with the setting in that scope.

@josephfarina
