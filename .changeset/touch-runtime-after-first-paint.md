---
'@astryxdesign/core': patch
---

[perf] SegmentedControl, Switch and BottomSheet no longer put the touch animator and gesture code in your page's first load. Core loads them once per page after first paint, when the page is idle. Until then these components work by taps, clicks and keys, with no drag tracking or spring, and a field focused in a bottom sheet keeps the browser's own reveal instead of riding the keyboard.

@cixzhang
