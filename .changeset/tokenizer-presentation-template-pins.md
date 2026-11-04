---
'@astryxdesign/cli': patch
---

[chore] The Tokenizer blocks and page templates that show a prop the bottom sheet does not render (`hasClear`, `endContent`, `tokenOverflowBehavior`, `hasEntriesOnFocus`, `renderToken`) pass `presentation="popover"`, so they keep the inline field on phones under Tokenizer's new `'adaptive'` default. (#9836)

@imdreamrunner
