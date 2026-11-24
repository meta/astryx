---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] The shared focus rings (the standard control outline and the focus-owner wrapper ring) and the disabled-field rings show for keyboard focus only. After a tap or a click, a disabled text field that takes focus, or a row that a sheet or dialog focuses when it opens, no longer shows one of these rings; keyboard focus still does, including focus that arrives from a child frame or the browser's own interface. Component-owned rings are unchanged. `astryx experimental theme` still reads each focus ring as the keyboard sees it, so its answers about focus rings and focused borders do not change.

@cixzhang
