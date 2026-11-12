---
'@astryxdesign/cli': patch
---

[fix] `theme build --watch` rebuilds when the theme source or any local file it imports changes (an ejected fork's palettes, a split theme), not only the entry file. `theme eject` refuses the local themes folder itself, which made `theme list` and `theme add` fail for every theme, and a folder in it named after another theme, which they skipped; it names the default target. A fork into a new folder in the local themes folder takes the folder's name, so `theme list` and `theme add` find it; a backslash in its path separates folders. `--package` on `theme add`, `theme list` and `theme eject` also takes the package a bundled theme is imported from (`@astryxdesign/theme-butter`), the name the CLI records and prints. A bundled theme whose package is missing names the install command and then the add. An unknown subcommand of `theme` or `experimental` suggests whole commands, closest first, and `theme editor` / `theme preview` point at `experimental theme editor` / `experimental theme preview`. The discovery refusals for a theme descriptor outside a theme folder, or in a folder with another name, say where to move the files.

@josephfarina
