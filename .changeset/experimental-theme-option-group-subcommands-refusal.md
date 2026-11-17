---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: an option typed before a group's real subcommand (`preview --theme t list`, `editor --mode light set t …`) is read as that: the refusal names the option and the subcommand, offers the command with the options the subcommand takes moved after it, and says which options it takes none of. An option's value is never reported as an unknown subcommand, and the line offered is the subcommand typed, never another one.

@josephfarina
