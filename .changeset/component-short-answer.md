---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name>` prints a short answer by default: what the component is, its import, a usage line, every prop as one line (name, type, default, required, and its description's first sentence), its accessibility requirements, its pieces with one command that reads them all, and the commands that print the rest (`--props` for each prop's whole description, `--detail full` for anatomy, best practices, examples and theming). The same answer is `--detail compact`; `--detail full` prints the whole doc as before, and `--json` is unchanged. Every part comes from fields each component doc already has, so an integration's component gets the same answer.

@josephfarina
