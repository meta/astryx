---
'@astryxdesign/core': patch
---

[feat] Themes can style an open `Selector`. The `selector` theme target has an `expanded` state, and the selector box carries `data-expanded="expanded"` while its list is open, so a theme rule set with `--state expanded --on selector` paints only the open trigger.

@cixzhang
