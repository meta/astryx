---
'@astryxdesign/cli': patch
---

[fix] With no update check recorded, `astryx doctor`'s `newest-release` check no longer says the check runs once a day after a command, which is true only for a copy installed for the computer. It now says that only that copy checks, that a project's own copy changes only when the project upgrades it, and that a tool that runs its own copy chooses its release.

@josephfarina
