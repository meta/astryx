---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview add`: an app frame's exact name as the description (`blank`, `shell-top-nav`) is refused with a clear reason and the `--template` command. An exact template name is called the page named, not the closest page. With no routes folder, the refusal names the Next apps below with a `--path` into each, and a `--path` that would make a routes folder with no root layout is refused before writing. Page packages are read from the app the preview is in. The Core stylesheet check starts from the root layout over the preview, route groups included, and follows tsconfig path aliases.

@josephfarina
