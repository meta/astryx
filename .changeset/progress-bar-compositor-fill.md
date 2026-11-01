---
'@astryxdesign/core': patch
---

[fix] A determinate ProgressBar keeps moving to its new value while a script runs. The fill animated its `width`, which lays out and repaints on the main thread every frame, so a value change stalled for as long as the page ran JavaScript and then jumped. The fill now spans the track and slides into place with a transform that the browser animates on its compositor, in Chromium and in Safari, laying out and painting nothing per frame. Under reduced motion a new value now lands at once, on every pointer. Otherwise duration, easing, colors, marks and right-to-left drawing are unchanged (the fill mirrors with the bar's own direction, so a bar in a left-to-right region of a right-to-left page still fills from the left); the track now clips its fill to the rounded rail in both modes, so below about one track height of fill the leading end follows the track's curve instead of drawing a narrower full-height capsule, and a runtime change of the bar's direction slides the fill across to the other side instead of jumping there.

@vjeux
