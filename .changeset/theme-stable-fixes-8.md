---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` (and `experimental theme compile --check`) names every output the build writes as checked, the `.css.d.ts` stylesheet types too. When the only missing output is a `.css.d.ts` stub, as in projects that keep it out of version control, the check prints one warning line in text mode naming it, and the stub alone does not fail it; `--json` stays silent and the result is unchanged. Every output the check failed on before still fails it, a missing `.d.ts` or `.variants.d.ts` included. `theme eject` into a subfolder of a folder the theme editor made (`themes/g/sub`, where `themes/g/g.settings.json` exists) writes there as released CLIs did, and warns once on stderr in text mode, naming how to keep the editor's folder to its own theme (fork into the project's local themes folder, or pick a path outside the editor's folder); `--json` stays silent and the receipt is unchanged.

@josephfarina
