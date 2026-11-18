---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` loads a page whose modules import a `.tsx` file by its `.js` name (`./parts/Kpi.js` for `Kpi.tsx`), which used to fail with `ERR_FILE_NOT_FOUND`. `--reverse` gives back a page whose modules import any TypeScript file by its JavaScript name (`.js`, `.jsx`, `.mjs`, `.cjs`), which it used to refuse as damaged. A file in which such an import is relative says render format 3, so an earlier CLI names the CLI that reads it instead of calling it damaged; one through a path alias (`@/lib/rows.js`) keeps format 1.

@josephfarina
