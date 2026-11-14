---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` and `--reverse` read path aliases from the config TypeScript reads for the page: the nearest `tsconfig.json` (else `jsconfig.json`) at or above it, through its `extends` (a path with or without `.json`, a package's config, or a list, the later one winning, with `${configDir}`), and, behind a solution-style `tsconfig.json` (`"files": []` with `references`, as Vite sets up), the referenced project that includes the page. A page whose aliases live in `tsconfig.app.json` or in an extended config used to fail, with `ERR_FILE_NOT_FOUND`, or with `ERR_RENDER_MISSING_DEPENDENCY` when the alias looks like a package name (`@data/rows`), although `tsc` and the app's build found its imports.

@josephfarina
