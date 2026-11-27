---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a caller `onFocus` or `onBlur` that calls `preventDefault()` no longer turns off built-in focus behavior. Arrow keys still select the segment they move to, the keyboard hint still shows on first keyboard focus and closes when focus leaves the control, and the caller's handler still runs first. A caller `onKeyDown` can still cancel arrow navigation.

@cixzhang
