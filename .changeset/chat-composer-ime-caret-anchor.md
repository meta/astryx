---
'@astryxdesign/core': patch
---

[fix] ChatComposerInput: composing with an input method (for example Japanese or Chinese) right after picking a mention, inserting a token, or inserting text after a token now commits only the composed text. The composer places its caret inside the trailing text, not on an element boundary, so the first raw letter of the composition is no longer committed. Right after a mention pick, one Backspace now removes the mention with its space, and no stray line break is left.

@ManoharPaturi
