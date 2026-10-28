---
'@astryxdesign/core': patch
---

[fix] Slider: a drag belongs to the pointer that started it. A second finger that lands on the slider, moves or lifts during a drag no longer moves the value, takes over the drag or ends it, and two fingers can still drag two sliders at once. A drag whose pointer capture is lost without a pointer up also ends, with one `onChangeEnd`, so the slider keeps answering new presses. Introduced in #8152; final-state evidence (#8284).

@vjeux
