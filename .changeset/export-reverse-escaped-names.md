---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export --reverse`: an image a carried module names with percent-escapes (`/pics/a%20b.png`, `./c%20d.png`) is expected back as the file those escapes name ("a b.png"), the file the export read and carried. Before, `--reverse` restored the file but listed the escaped name as missing and reported the restore as not exact.

@josephfarina
