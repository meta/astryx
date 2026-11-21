---
'@astryxdesign/cli': patch
---

[fix] When the word you typed is both one of the project's package.json scripts and a typo of a command, the answer names the script's run first and still names the command after it: with a `doc` script, `astryx doc` names `npm run doc`, then `docs`. When the run also carries an option the CLI does not take, the answer names the script's run, then the help, with the options you typed.

@josephfarina
