---
'@astryxdesign/cli': patch
---

[fix] `astryx theme add` of a shared theme over the working files a `theme remove` kept (its settings unchanged, and the bundle's state passing every check) keeps the app copy the editor's (`maintained: false`, under its mark), so the editor's builds keep updating it.

@josephfarina
