---
'@astryxdesign/cli': patch
---

[fix] A stop signal sent to the CLI's own process while it installs the release matching a project's Core, such as a time limit's SIGTERM, now stops the run. Before, the run went on once npm returned, answered, and exited 0 to a caller that had already given up: npm runs synchronously, so the signal waited for the install to end, and by then its handler was gone. The handler now stays until the signal is delivered, and the hand-off lets it stop the run before it answers.

@josephfarina
