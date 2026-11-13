---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: `add --path` refuses an intercepting route folder (`(.)x`, `(..)x`, `(..)(..)x`, `(...)x`), where a page breaks the whole app. The preview loads the fonts stylesheet of the theme it is built on (Figtree for neutral), and so does the `preview app` starter, so the Overview shows the family it names. `preview list` text marks a page whose file is gone as missing, matching `--json`.

@josephfarina
