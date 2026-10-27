---
'@astryxdesign/core': patch
---

[fix] Changed the Link anchor's `display` from the previous `inline-flex` to `inline` when its children are only text, so an ancestor `<Text maxLines>` clamp can truncate it. Every form that needs the box keeps the previous `inline-flex` appearance: external links (icon + gap), the button-rendered form, `display="block"`, a Link clamping itself via its own `maxLines`, and links with element children such as icons or block wrappers. To keep the old boxed look for a text-only link, give it any of those (for example an element child or its own `maxLines`). Link and Text docs now state the rule: only a Link whose children are text is clamped by an ancestor. (#6021)
