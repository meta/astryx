---
'@astryxdesign/core': patch
---

[fix] When a `TreeList` row collapses while keyboard focus is inside its children, for example from an `items` change, focus moves to that row, which then holds the tree's Tab stop. Before, focus fell to the page, so a keyboard or screen-reader user lost their place (WCAG 2.2 SC 2.4.3). Focus anywhere else is not moved.

@cixzhang @duytbp
