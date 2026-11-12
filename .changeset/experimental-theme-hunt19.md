---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` follows every local file the theme source reads, as the build resolves it (`./tok` to `tok/index.tsx`, `./c.cjs` to `c.cts`, `./j.jsx` to `j.tsx`), including your own files in the theme's `tokens/` folder; only the editor's generated palette files there are left to their own stamps. A pair of values in quotes such as `['600', '700']` is no longer called "not text"; a size given as a number without a unit is named, with an example that passes, and a `{light, dark}` object is named instead of a raw error. `experimental theme template` in a folder the theme editor made guards only the editor's own files: an earlier template there is replaced with `--overwrite`, and for an editor file the skip names a free path instead of `--overwrite`. `undo` refuses an `--only` the setting was not made with, matches a value whatever its comma spacing (`rgb(255,0,0)`), and `undo <theme> mode`/`base` says when the history does not reach back to how the theme was made. A build that fails puts the files back and says nothing was changed, and `show` no longer says it built a theme its source cannot carry.

@josephfarina
