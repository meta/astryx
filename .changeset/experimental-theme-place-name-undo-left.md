---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: settings typed where the theme goes, as a list or a pasted form (`show corners, accent`, `show corners:pill`, `'{"corners":"pill"}'`), get a look at each theme here, never a theme made of them nor "names more than one theme". `new` reads more settings typed after the name as their options, never as name words: a colon word apart from its value (`accent: red`), a dial typo (`cornres pill`), `base <theme>` as `--like`, a pasted value across words (`font=Inter, Arial`), a dial word after an option's value (`--accent red corners pill`), and a property new takes no option for (`padding 8px`), offered as a `set` after the theme is made; a setting with its value typed as the name (`new 'corners pill'`) is never the name offered. `undo` reads a value with commas typed unquoted when the theme is left out (`undo Inter, Arial`), a value then its setting (`undo t red accent`), and a scope in a spelling set reads (`--on Card`, `cards`, `--mode drak`): the line for that scope's setting leads. An option whose value names another subcommand (`editor --on show set t …`) keeps it. A mode typed with its letters in another order (`--mode kdar`) is that mode. `experimental theme compile` with no file names its usage and help.

@josephfarina
