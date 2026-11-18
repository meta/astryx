---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme compile`: a successful compile of an editor theme always writes its app copy from what it just built, a hand edit of `<theme>.theme.ts` included, with the copy's font stylesheet from the fonts the theme loads now (a font package installed or removed since; a `set` that changes nothing refreshes it too). `--check` reads the copy as a checkout writes it (CRLF line endings pass), compares it only once the theme's outputs are current (a hand-edited theme output is named by the outputs check), and a stale copy keeps the documented check result: `upToDate: false`, code `ERR_THEME_STALE` and `appCopyStale` saying why. The copy's source and folder are no compile targets, an `--out` at the copy folder (any case, with or without a slash) is refused and suggests the same compile without `--out`, and a refused compile writes no copy. The help says so.

@josephfarina
