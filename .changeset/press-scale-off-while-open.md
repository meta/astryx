---
'@astryxdesign/core': patch
---

[fix] A press no longer scales a trigger whose own layer is open: a Button that opens a menu or a Popover, and a ghost or secondary Selector, MultiSelector or ComplexSelector. Under a mouse or a finger, the open layer stays where an unpressed open puts it. A disclosure button without a popup keeps its press.

@vjeux
