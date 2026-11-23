---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> --text-<name>-size <size> --on <part>` takes a text size token said for a part that reads none, where the parts it holds read one size token: the value goes into that token on the part (`--text-body-size 13px --on tab-list` sizes the tab labels through `--text-label-size`). The setting is saved as typed and the build writes only that token. A part that draws text pieces of its own, a group, a state, or a value naming that token is refused as before.

@josephfarina
