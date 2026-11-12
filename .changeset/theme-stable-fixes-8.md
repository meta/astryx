---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` (and `experimental theme compile --check`) names every output the build writes as checked, the `.css.d.ts` stylesheet types too. When the only missing outputs are type declaration files (`.css.d.ts`, `.d.ts`, `.variants.d.ts`), as in projects that keep generated declarations out of version control, the check prints one warning line in text mode naming them, and they alone do not fail it; `--json` stays silent and the result is unchanged. A missing stylesheet or module still fails the check. `theme eject` into a subfolder of a folder the theme editor made (`themes/g/sub`, where `themes/g/g.settings.json` exists) writes there as released CLIs did, and warns once on stderr in text mode, naming how to keep the editor's folder to its own theme (fork into the project's local themes folder, or pick a path outside the editor's folder); `--json` stays silent and the receipt is unchanged.

@josephfarina
