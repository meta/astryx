---
'@astryxdesign/core': patch
---

[fix] Preserve NavHeadingMenuItem focus across disabled transitions with LinkProvider components that do not forward DOM refs. Disabled items withhold caller event callbacks except focus and blur, while preserving parent menu handling and caller-rendered child events. Existing disabled navigation, tab order, and menu keyboard movement are unchanged.
@korkt-kim
