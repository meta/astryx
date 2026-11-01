---
'@astryxdesign/core': patch
---

[fix] TabList: pressing or arrowing to a tab in a scrolling strip no longer measures the strip inside the press. Focusing the tab already scrolls it into view, so the check that keeps the selected tab whole now runs in the next frame instead of forcing the new selection's style and layout before the press can paint.

@cixzhang
