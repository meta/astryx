---
'@astryxdesign/cli': patch
---

[feature] The agent block that `astryx init` writes ends with one line on how to remove it: run `astryx init --remove-agents`, and do not delete or edit it by hand. Asked to take Astryx's text out of a project, agents deleted agent files or cut one copy by hand and left the copies in the other files; with the line, they run the command.

@josephfarina
