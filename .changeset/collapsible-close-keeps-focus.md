---
'@astryxdesign/core': patch
---

[fix] When a `Collapsible` closes while keyboard focus is inside its content, for example from an owner-set `isOpen` or a group's value, focus moves to its trigger. Before, focus fell to the page, so a keyboard or screen-reader user lost their place (WCAG 2.2 SC 2.4.3). Focus anywhere else is not moved.

@cixzhang @duytbp
