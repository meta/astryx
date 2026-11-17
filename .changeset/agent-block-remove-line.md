---
'@astryxdesign/cli': patch
---

[feature] The agent block that `astryx init` writes ends with one line on how to remove it: run `astryx init --remove-agents`, which removes it from the agent files at the project root and in the folder you run it in, and delete any other copy between its markers. Asked to take Astryx's text out of a project, agents deleted whole agent files or cut one copy by hand and left the others; with the line, they run the command and remove what it leaves.

@josephfarina
