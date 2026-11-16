---
'@astryxdesign/core': patch
---

[perf] A page that renders `ToggleButton` without `ToggleButtonGroup` no longer loads the group's press tracking and the touch runtime it brings. A standalone ToggleButton page's first-load JavaScript drops by about 26.5 KB gzip. Toggle buttons in a group behave the same.

@cixzhang
