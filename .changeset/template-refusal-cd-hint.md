---
'@astryxdesign/cli': patch
---

[fix] When `astryx template <name> <path>` refuses a path outside the project, it also names the command that writes that same path: a change to the nearest folder of it that exists, then the template command with the path from there. Printed, the CLI invocation follows the change of folder.

@josephfarina
