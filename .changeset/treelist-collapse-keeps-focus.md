---
'@astryxdesign/core': patch
---

[fix] When a `TreeList` row collapses while keyboard focus is inside its children, for example from an `items` change, focus moves to that row (the outermost one when nested rows collapse together), which then holds the tree's Tab stop unless it is disabled (a disabled row takes focus, and the stop goes to the tree's first enabled row if the collapse removed the row that held it). Before, the focused row disappeared and nothing held focus, so a keyboard or screen-reader user lost their place (WCAG 2.2 SC 2.4.3). Focus anywhere else is not moved.

@cixzhang @duytbp
