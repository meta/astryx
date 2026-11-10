---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] Tab's docs show how to give a tab help text: anchor a `Tooltip` on the `Tab` through its ref, so the description lands on the tab, and put a decorative info `Icon` in `endContent`. `endContent` is documented as non-interactive: a button, link, or `InfoTip` inside it would nest a control inside the tab's button (#10732).

@cixzhang
