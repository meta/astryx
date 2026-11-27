---
'@astryxdesign/core': patch
---

[docs] Section: the `padding` description now gives the order an omitted `padding` follows: the theme's per-edge or per-axis section padding, then the nearest ancestor Section's explicit `padding` (not across an overlay or a layout root such as AppShell), then the theme's section padding, then 4. No behavior change.

@cixzhang
