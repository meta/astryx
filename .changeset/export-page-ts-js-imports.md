---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` loads a page whose own modules import each other the TypeScript way, by a `.js` name for a `.ts` or `.tsx` file (`./parts/Kpi.js` for `Kpi.tsx`), as TypeScript and bundlers do. Such a page used to fail with `ERR_FILE_NOT_FOUND`. `--reverse` gives those files back exactly.

@josephfarina
