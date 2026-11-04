---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` gains the `promote-tokenizer-presentation` codemod, which rewrites a static `experimental={{presentation: x}}` on Tokenizer to the stable `presentation={x}` and leaves a TODO where it cannot prove the rewrite. The Tokenizer blocks and page templates that show a prop the bottom sheet does not render (`hasClear`, `endContent`, `tokenOverflowBehavior`, `hasEntriesOnFocus`, `renderToken`) pass `presentation="popover"`, so they keep the inline field on phones under the new `'adaptive'` default.

@imdreamrunner
