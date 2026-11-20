---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a value ending in an old browser hack's escape (`padding '8px\9'`, `--spacing-4 '8px\9'`, `box-shadow 'none\0'`) is refused, and the value without the escape is offered (`set … padding 8px`). Before, it was written, and browsers dropped it: a card's padding went to 0, and every use of such a token broke.

@josephfarina
