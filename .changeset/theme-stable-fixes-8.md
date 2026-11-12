---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` (and `experimental theme compile --check`) checks every output the build writes, the `.css.d.ts` stylesheet types too: a missing one makes the check stale (`upToDate: false`, `code: "ERR_THEME_STALE"`, exit 1) and is named as `missing`, where before the check passed and listed it as checked. `theme eject` into a subfolder of a folder the theme editor made (`themes/g/sub`, where `themes/g/g.settings.json` exists) writes there as released CLIs did, and warns once on stderr in text mode, naming how to keep the editor's folder to its own theme (fork into the project's local themes folder, or pick a path outside the editor's folder); `--json` stays silent and the receipt is unchanged.

@josephfarina
