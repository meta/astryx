---
'@astryxdesign/core': patch
---

[fix] Link: inside a `<Text maxLines>` the link now truncates with the text. There its root lays out inline, in the text's lines, so the clamp can cut through the link, and its keyboard focus ring sits inside each line so the clamp does not clip it. Elsewhere, and for a Link that sets its own `display` or `maxLines` or renders as a button, the root keeps its `inline-flex` box. (#6021)

@ManoharPaturi
