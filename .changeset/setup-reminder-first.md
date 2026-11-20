---
'@astryxdesign/cli': patch
---

[fix] The setup reminder (`Next step: run … init …`, shown at most once a day in a project that has not run `init`) now prints on stderr before the command's own output instead of after it. Agents often keep only the start of a long answer (`2>&1 | head`), so a reminder at the end was cut and the day used up without anyone seeing it. It still never prints under CI, in `--json`, or once the project is set up; a command that fails now shows it too.

@josephfarina
