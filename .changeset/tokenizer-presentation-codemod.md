---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` gains the `promote-tokenizer-presentation` codemod. It rewrites a static `experimental={{presentation: x}}` on Tokenizer, the 0.7.7 spelling that Tokenizer no longer reads, to `presentation={x}`. Where it cannot prove the rewrite, including any Tokenizer that spreads props (a spread may also set `presentation`), it leaves the call unchanged with a TODO.

@imdreamrunner
