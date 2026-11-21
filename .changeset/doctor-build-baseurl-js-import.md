---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx doctor` no longer offer to install a package named after a project folder, such as `src`, for an import the project's `baseUrl` maps to a TypeScript file written with a `.js` extension (`src/rows.js` for `src/rows.ts`). They now read such an import as the project's own file, as TypeScript does.

@josephfarina
