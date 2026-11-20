---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` prints a short kept-cache row. Before, the `gather-cache` row printed a paragraph of about 2 KB: every kind of kept result, when each is used, the size limit, the transpile cache, and "deleting the folder clears it". Now the row prints only the folder, its entry count and size, the command that lists every kept item and the size limits (`astryx doctor --json`), and the exact command that clears the caches, such as `rm -rf ~/.cache/astryx/catalogs`. That command also names the transpile cache folder when it exists. The JSON check keeps its whole `message` and adds an optional `brief` field with the short form, which text prints in the message's place; the legend then reads `message (or brief)`. Ids, statuses and exit codes do not change.

@josephfarina
