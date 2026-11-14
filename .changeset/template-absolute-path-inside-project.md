---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name> <path>` and `astryx template --cdn <path>` accept an absolute path inside the project root, also through a symlinked project folder. It is written exactly as its relative form. An absolute path outside the project is still refused with `ERR_PATH_TRAVERSAL`. For `astryx template <name> <path>`, the receipt says the path was written as its relative form (`data.givenPath` in `--json`), and the refusal names a command that writes inside the project (`astryx template <name> src/pages/<name>`, or `src/components/<name>` for a block) and the command that prints the source without writing anything. For `--cdn`, the receipt is unchanged, and the refusal names `astryx template --cdn cdn.template.html`.

@josephfarina
