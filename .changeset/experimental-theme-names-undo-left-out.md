---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `set` with the theme left out and a value of several words (`set padding '4px 8px' --on card`, `set shadow '0 1px 2px red' --on card`) offers the set on the one theme here when set's check passes it, every option kept, never a theme named after the setting. `undo` never offers to make a theme from the word: a typo of a setting the theme holds (`undo acent`), a value it holds (`undo red`, `undo t red`), or a setting with its value in one word (`undo 'corners pill'`) gets that setting's undo, and a step back says which change it takes back; `show 'corners pill'` looks at the theme. A value with commas typed unquoted, as `set` takes it (`undo t font Inter, Arial`), is that setting's value, never a list. `new` reads a setting typed after the name (`new t2 accent red`, `corners=pill`, `corners: pill; accent: red`, a pasted JSON object) as its option, never part of the name, and a token typed for the name (`new --color-accent`) is never the name offered. An option typed before a nested group (`theme --mode dark editor set …`) goes after the command it names; an option whose value is a subcommand's name keeps it; and options with no subcommand at all (`preview --theme t`) name the subcommands that take them, never their value as a subcommand.

@josephfarina
