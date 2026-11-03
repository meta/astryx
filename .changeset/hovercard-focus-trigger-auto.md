---
'@astryxdesign/core': patch
---

[fix] Under `focusTrigger="auto"`, a `HoverCard` now decides whether focus opens it when the focus arrives, as `Tooltip` does. A roving-tabindex trigger that was `tabindex="-1"` when the card attached, such as a toolbar member, opens on arrow-key focus, and a focusable trigger such as a `<summary>` or an SVG link opens on focus.

@cixzhang @duytbp
