---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export --reverse`: an image a carried module names with percent-escapes (`/pics/a%20b.png`, `./c%20d.png`) is expected back as the file those escapes name ("a b.png"), the file the export read and carried. Before, `--reverse` restored the file but listed the escaped name as missing and reported the restore as not exact. The export also carries such an image when the page draws it only later (after a click), so it shows from the file. An image the page imports, or loads with `import()` or `require()`, by such a name is carried and followed as written, as before.

@josephfarina
