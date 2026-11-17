---
'@astryxdesign/cli': patch
---

[fix] A template doc's `{@command …}` and `{@pm …}` tokens no longer print as written. `astryx template` (the list and `--skeleton`), `astryx build` and `astryx search` show the command with the project's command in text, as `astryx docs` does, and as the bare `astryx …` command in `--json`; the JSON shape does not change. `build` and `search` text show every description's commands with the project's command too. A template's source still prints byte for byte.

@josephfarina
