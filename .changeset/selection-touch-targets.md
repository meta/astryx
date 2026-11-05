---
'@astryxdesign/core': patch
---

[feat] Under a finger, a labelled CheckboxInput and each RadioList option get an invisible hit area. It grows toward 44 px, never makes the target smaller than the control’s own box, and stops at half the gap to a closer neighbour, so neighbouring targets never overlap. Nothing changes size. Under a finger a RadioListItem row’s `::after` is that hit area, so decorate a row with a child. A label-hidden checkbox inside another component’s row keeps that row’s target. With a mouse or trackpad nothing changes.

@vjeux
