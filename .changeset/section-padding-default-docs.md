---
'@astryxdesign/core': patch
---

[docs] Section: the `padding` docs now give the order an omitted `padding` follows: the theme's per-edge or per-axis section padding, then the nearest ancestor Section's explicit `padding` (not across an overlay or a layout root such as AppShell), then the theme's section padding, then 4. They said the default was always 4. No behavior change.

@cixzhang
