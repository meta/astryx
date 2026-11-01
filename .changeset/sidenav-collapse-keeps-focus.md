---
'@astryxdesign/core': patch
---

[fix] When a collapsible `SideNav` collapses and takes the keyboard focus with it, focus now moves instead of falling to the page, where a keyboard or screen-reader user lost their place (WCAG 2.2 SC 2.4.3). From a row the collapsed rail does not render, such as an item without an icon, focus moves to the collapse toggle, or, with no toggle in the SideNav, to the nearest row still in the rail. On a row the rail keeps, focus stays on that row, and a header or footer control the collapse re-renders keeps it. From a header or footer control the collapse removes, or the resize handle of a `resizable` SideNav, focus moves to the collapse toggle, or, with none, to the first row. Focus the collapse does not take is not moved.

@cixzhang @duytbp
