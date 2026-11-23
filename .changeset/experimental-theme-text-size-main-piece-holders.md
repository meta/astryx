---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> font-size <size> --on <part>` refuses, as before, a text size said of a part that holds other parts (`--on popover`, `--on calendar`), so the buttons and fields inside keep their own sizes; only a part whose own inner elements draw its text takes its main text's token.

@josephfarina
