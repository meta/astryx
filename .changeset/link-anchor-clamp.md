---
'@astryxdesign/core': patch
---

[fix] Link: inside a `<Text maxLines>` the link now truncates with the text. There its root lays out inline, in the text's lines, so the clamp can cut through the link, and its keyboard focus ring is inset into each line, so the clamp keeps the ring's top and bottom edges visible. Elsewhere, and for a Link that sets its own `display` or `maxLines` or renders as a button, the root keeps its `inline-flex` box. A Link with block-level content, such as an `HStack` with an icon, is not supported inside a clamped Text, because it breaks the clamp; place that composition outside the clamp. (#6021)

@ManoharPaturi
