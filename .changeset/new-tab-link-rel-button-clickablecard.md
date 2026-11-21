---
'@astryxdesign/core': patch
---

[fix] A Button, IconButton, or ClickableCard link with `target="_blank"` now gets `rel="noopener noreferrer"`, as Link and Item already do. On Button and IconButton the two tokens are added beside your own `rel` tokens, each once. Links without `target="_blank"` get no added `rel`.

@viwe-monai
