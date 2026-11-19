---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx doctor` give each file that says a tool generates it (`@generated`, `@partially-generated` or `Code generated … DO NOT EDIT.` in its leading comments) one note with the count and that tool (`--family` and doctor give one per file, however many themes extend it), instead of a warning per setting it writes that does not show as written: that file is not where the fix goes. The build's note reaches text, `--json`, `--check` and `--family` output, and `settingIssues` still lists each setting; doctor's note names the `theme build --check --json` command that lists them. A hand-written theme that a generated one extends keeps its own warnings.

@josephfarina
