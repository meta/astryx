---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name> <path>` and `astryx template --cdn <path>` accept an absolute path inside the project root. It is written exactly as its relative form, also through a symlinked project folder, and the receipt says so (`data.givenPath` in `--json`). An absolute path outside the project is still refused with `ERR_PATH_TRAVERSAL`, and the error now names a command that writes inside the project (`astryx template <name> src/pages/<name>`, or `src/components/<name>` for a block) and the command that prints the source without writing anything.

@josephfarina
