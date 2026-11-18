---
'@astryxdesign/cli': patch
---

[fix] `astryx component` and `astryx discover <package>/<Component>` print the commands a component doc writes (with a `{@command …}` token, a `{@link …}`, or a bare `astryx …` code span) with the project's command, as `astryx docs` does, instead of a bare `astryx …` that may not run in the project. `--json` keeps the bare command.

@josephfarina
