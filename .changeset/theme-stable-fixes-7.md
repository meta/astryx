---
'@astryxdesign/cli': patch
---

[fix] `theme template` run from a folder inside a project reads its path from that folder within the project root, and with no path writes `theme.template.ts` at the project root, as its help says. A stale `theme build --check` (and `experimental theme compile --check`) result carries `code: "ERR_THEME_STALE"` beside `upToDate: false`, the code it exits 1 with. A file at an `--out` path that the build did not write is left alone with its real reason and a free `--out` path; the build never suggests deleting it. `--out` into a folder the theme editor made is refused for any other theme's source, with the build beside the source.

@josephfarina
