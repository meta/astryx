---
'@astryxdesign/core': patch
---

[feat] SelectableCard takes `inputType="radio"` and an `htmlName` (the native input name, as on RadioList and CheckboxInput): a card in a single-choice set is then a native radio in that named group, so the set is one tab stop, the arrow keys move and select, and the position is spoken. A radio card selects and never deselects itself, and a disabled card submits nothing with its form. The default stays `checkbox`.

@vjeux
