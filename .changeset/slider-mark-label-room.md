---
'@astryxdesign/core': patch
---

[fix] A horizontal `Slider` with labelled `marks` now keeps room for the labels: before, the labels hung below the slider's box and the content after it overlapped them; now that content starts below the labels. The labels take the supporting text's line height, so the room no longer depends on the surrounding text. Sliders without mark labels, and vertical sliders, keep their size.

@cixzhang
