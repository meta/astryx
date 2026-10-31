---
'@astryxdesign/core': patch
---

[fix] When a collapsible `SideNav` collapses while keyboard focus is on a row the collapsed rail does not render, such as an item without an icon, focus moves to the collapse toggle, or, with no toggle in the SideNav, to the nearest row still in the rail. Before, focus fell to the page, so a keyboard or screen-reader user lost their place (WCAG 2.2 SC 2.4.3). Focus anywhere else is not moved.

@cixzhang @duytbp
