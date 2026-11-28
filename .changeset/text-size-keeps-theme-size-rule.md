---
'@astryxdesign/core': patch
---

[fix] A theme that sets a font size in its own Text `size` rule keeps that font size for `<Text size>`: the size override that lets `size` beat a themed `type` now carries the rule's `fontSize` (and its `@light` and `@dark` font sizes) instead of Core's size token, at the theme root, on a media surface and in an adaptation, in either order of the theme's `type:` and `size:` rules. Only the font size is carried, so the type keeps its line height; a size the theme does not give a valid font size keeps Core's token.

Reported by @ejc3.

@cixzhang
