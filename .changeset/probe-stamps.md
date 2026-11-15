---
'@astryxdesign/cli': patch
---

[perf] What the CLI keeps between runs is checked against what each check it made returned, and no more. A check whether a file is there is checked by whether it is still there, and a real-path lookup by the folder it finds the path in, the path's name and what it is, or, for a link, by where it resolves. An edit to a file the CLI only checked for, or only resolved, no longer makes the next run work its kept data out again. A file whose content any kept step read is checked by its stamp, as before, and so is an ignore file npm reads when a check asks what a package packs. Output does not change.

@josephfarina
