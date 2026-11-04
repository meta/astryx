---
'@astryxdesign/core': patch
---

[feat] On a touch device with a trackpad or a mouse, such as a tablet with a keyboard, the picker wheels in the TimeInput, DateTimeInput and DateInput bottom sheets now take a trackpad's two-finger scroll as a finger: the rows follow the fingers, coast on at their lift, and rest on a row. One mouse-wheel notch turns a wheel one row, as an arrow key does, with no coast. Before, both moved the rows by each scroll's own distance, so a trackpad's momentum ran at the browser's rate and one notch moved several rows. A ctrl-scroll still zooms the page. (#8159)

@vjeux
