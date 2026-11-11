---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how --list` is now a switch, as `--list` is everywhere else in the CLI: the first word says what to list and any words after it filter the list (`how --list tokens accent`), and `--list` alone lists the kinds. Reading a built theme no longer writes a temporary file into `themes/<theme>/`; it uses the project's cache folder.

@josephfarina
