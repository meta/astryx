---
'@astryxdesign/core': patch
---

[fix] A disabled `Token` reflects its state on the `token` theme target (`data-disabled`) in every structure, so a theme can style it. A disabled link token keeps a focusable link announced as disabled (`aria-disabled="true"`, no `href`), instead of becoming plain text with no tab stop.

@cixzhang @duytbp
