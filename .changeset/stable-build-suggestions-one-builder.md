---
'@astryxdesign/cli': patch
---

[fix] `theme build`: the refusal for a quoted glob keeps `--family` and `--family-key` in a family run, and builds its suggestion with the same builder as the build's other refusals of a source; the experimental compile's refusals for the editor's settings file and for a subfolder keep `--out` (rebased onto the app root for the `cd` one), so the suggested check reads the output you asked about. (Minimal change to shared code: `buildSuggestion` gains an optional shape for a glob or a family run, and the build command passes `--out` to a group's preflight.)

@josephfarina
