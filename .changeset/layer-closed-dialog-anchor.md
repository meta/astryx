---
'@astryxdesign/core': patch
---

[fix] `Popover`, `Tooltip`, `HoverCard` and the other anchored layers open again when their trigger sits in a native `<dialog>` that the page displays closed. Such a dialog never enters the top layer, so its trigger is a valid anchor. The layer waited for the dialog to open, and it never opened.

A layer still waits for a `Dialog` that displays its element before it calls `showModal()`. `Dialog`, `Drawer`, `Lightbox` and `MobileNav` open their dialog in the Effects of the commit that displays it. A trigger with a box in a closed dialog now waits for one more commit. React runs those Effects before it renders that commit, so a dialog that is still closed then stays closed, and the layer opens at once. For a press, that commit runs before the press's task ends, so the layer and its initial focus land within the press. A closed dialog with `display: none` gives its trigger no box, and the layer still waits for it with no time limit.

A second `show()` while a layer waits for the same trigger keeps that wait. It no longer restarts it.

@vjeux
