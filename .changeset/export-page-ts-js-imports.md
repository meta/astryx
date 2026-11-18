---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` loads a page whose own modules import each other the TypeScript way, by a `.js` name for a `.ts` or `.tsx` file (`./parts/Kpi.js` for `Kpi.tsx`), as TypeScript and bundlers do. Such a page used to fail with `ERR_FILE_NOT_FOUND`. `--reverse` gives those files back exactly. Such a file says render format 3: an earlier CLI cannot follow those imports, so it names the CLI that reads the file instead of calling it damaged.

@josephfarina
