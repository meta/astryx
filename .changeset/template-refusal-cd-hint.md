---
'@astryxdesign/cli': patch
---

[feat] When `astryx template <name> <path>` refuses the destination of a Core template that no integration replaces, outside the project (an absolute path, or one that leaves it through `..`), it also names the command that writes that same destination: a change to the nearest folder of it that exists, then the template command with the path from there, printed with the CLI invocation for that folder. When `--overwrite` was given, that command and the scratch-copy command keep it, so they do not refuse a second time; the suggested place inside the project is another file and never gets it. A `..` path used to get the refusal with no command to run; it now gets the same commands as an absolute one. A `..` path that lands in the system temp folder is still not a scratch copy; the refusal names its absolute path, which takes one.

@josephfarina
