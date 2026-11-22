---
'@astryxdesign/core': patch
---

[feat] AlertDialog's `description` takes inline content, not only a string, so a confirmation can emphasize or link what it is about to change. It still renders in the body text that `aria-describedby` names. Block content such as lists or paragraphs does not belong in it.

@nynexman4464
