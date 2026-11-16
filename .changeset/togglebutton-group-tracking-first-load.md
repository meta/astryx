---
'@astryxdesign/core': patch
---

[perf] A page that renders `ToggleButton` without `ToggleButtonGroup` no longer loads the group, its press tracking or the gesture code behind it. Measured on a ToggleButton-only page, first-load JavaScript drops by 0.4 to 1.5 KB gzip, depending on the bundler (Vite, Rolldown, webpack). Toggle buttons in a group behave the same.

@cixzhang
