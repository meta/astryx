---
'@astryxdesign/core': patch
---

[perf] SegmentedControl and Switch no longer put the touch animator and gesture host in your page's first load, BottomSheet no longer puts the animator there, and TextInput, TextArea and NumberInput no longer put the on-screen keyboard code there. Core loads them once per page after first paint, when the page is idle. Until then SegmentedControl and Switch work by taps, clicks and keys, with no drag tracking or spring; a bottom sheet dragged closed takes its normal exit; and a focused field keeps the browser's own reveal instead of Core's keyboard handling.

@cixzhang
