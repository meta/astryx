---
'@astryxdesign/core': patch
---

[fix] Preserve NavHeadingMenuItem focus across disabled transitions with LinkProvider components that do not forward DOM refs. Disabled items suppress click-capture, auxiliary-click, double-click, and Enter/Space keyboard callbacks in capture and bubble phases while preserving other keys, focus/hover observation, parent menu events, and caller-rendered child events. Existing disabled navigation, tab order, and menu keyboard movement are unchanged.
@korkt-kim
