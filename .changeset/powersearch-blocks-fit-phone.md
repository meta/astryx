---
'@astryxdesign/cli': patch
---

[chore] The PowerSearch blocks fit a phone-sized screen. Each sizes its field through a grid column, `minmax(0, <width>)`: the old width where there is room, and the container's width where there is not. The Search with Table block's table scrolls inside its own frame on a narrow screen instead of widening the example.

@imdreamrunner
