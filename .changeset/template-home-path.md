---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name> ~/<path>` reads `~/` as the home folder, as a shell does. A caller that passed `~` through unexpanded no longer gets a folder named `~` in the project: a home path outside the project is refused with the commands that work, like any absolute path outside it, and one inside the project is written there. `template --cdn` reads it the same way. To write into a folder that is really named `~` in the project, write it as `./~/<path>`.

@josephfarina
