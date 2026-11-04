---
'@astryxdesign/core': patch
---

[experimental] `experimental.presentation` is removed from Tokenizer, together with its `experimental` prop; use the stable `presentation` prop, which takes the same values. `astryx upgrade` rewrites static uses and leaves a TODO where it cannot prove the rewrite, such as on a Tokenizer that spreads props. (#9836)

@imdreamrunner
