---
'@astryxdesign/cli': patch
---

[fix] An unknown command names the command meant when its words come from another command line. `astryx add theme matcha` names `theme add matcha`, not `integration add theme matcha`; `astryx eject button` names `swizzle Button`, not `theme eject button`; `astryx templates list` names `template --list`, not a template called `list`. A short table of other tools' words names the command that does their job: `migrate --from 0.6.0` names `upgrade --from 0.6.0`, `add button` names `swizzle Button` and `component Button`, `add settings --path <file>` names `template settings <file>`, `props Card` names `component Card --props`, and `browse integrations` names `discover`. A suggestion keeps the options in reach of the command it names, including the program's own (`--json`, `--base`), and names an input the run still needs as a placeholder (`upgrade --from <old-version>`). A suggestion is never run for you.

@josephfarina
