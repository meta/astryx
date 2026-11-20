---
'@astryxdesign/cli': patch
---

[fix] A `{@link …}` in a template's description no longer prints as written. `astryx template` (the list, `--skeleton`, and a template read), `astryx build`, `astryx search` and `astryx component <Name> --blocks` resolve it to the command that opens the doc it names, as `astryx docs` does: with the project's command in text, and as the bare `astryx …` command in `--json`. The JSON shape does not change.

@josephfarina
