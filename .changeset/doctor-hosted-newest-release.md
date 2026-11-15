---
'@astryxdesign/cli': patch
---

[fix] With no update check recorded, `astryx doctor`'s `newest-release` check no longer says the check runs once a day after a command, which is true only for a copy installed for the computer. It now also says that a copy a tool runs for you is kept current by that tool, so an agent that runs Astryx through such a tool does not look for a manual update.

@josephfarina
