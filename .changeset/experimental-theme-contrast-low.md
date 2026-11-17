---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` fixes contrast problems at their source: a whole-theme text color too faint in many places gets one line on that token, the nearest color that reads everywhere it was too faint, instead of one line per part; a pale status or accent fill gets the nearest darker color that stands out from the page as its line; and a failure the base theme draws itself is said by `show`, not after every change.

@josephfarina
