---
'@astryxdesign/core': patch
---

[fix] LayoutContent, LayoutPanel and a scrollable `div` or `span` StackItem name their region while it scrolls. Before, a scrolling region was a nameless element that Chromium could make a Tab stop, so a screen reader announced nothing about it. It is now a group named by the caller's label, or by a translated "Content" (accessibility target: LayoutContent AR3, LayoutPanel AR3 and Stack AR2). A caller's role stays with only the caller's name, and Tab behavior stays the browser's.

@vjeux
