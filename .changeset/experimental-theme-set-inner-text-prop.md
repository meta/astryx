---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` now refuses a text property that an element inside the part sets itself to a value the component's props choose, instead of saving a setting that never shows. `white-space pre-wrap --on code-block` is refused: the code lines keep `pre` (or `pre-wrap` when the app wraps them), so only the app's prop changes it.

@josephfarina
