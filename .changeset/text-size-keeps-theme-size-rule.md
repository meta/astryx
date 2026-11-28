---
'@astryxdesign/core': patch
---

[fix] A theme that styles a Text `size` itself keeps that font size for `<Text size>`: the size override that lets `size` beat a themed `type` now carries the theme's own size rule instead of Core's size token, at the theme root, on a media surface and in an adaptation, whatever order the theme writes its `type:` and `size:` rules in. A size the theme does not style keeps Core's token, as before.

Reported by @ejc3.

@cixzhang
