---
'@astryxdesign/core': patch
---

[feat] ContextMenu opens from a held finger as on iOS, on every touch device (a coarse primary pointer, iOS and Android alike). The trigger starts to grow at 150 ms (the onset of core's one press machine), following UIKit's measured press curve on the compositor, and the hold is the trigger's context request: UIKit's long press. At 500 ms the press takes the finger and the menu opens: its lift sends no click, and the page cannot scroll under it. A finger that lifts before 500 ms, or drifts more than 10 px before it, gets no menu, and the trigger springs back. The page stays still while the menu is up, and the trigger returns to its size when the menu closes. A touch open lights no row: the menu takes the focus, and a row lights only under the finger, as in UIKit (keyboard and pointer opens still focus the first item). A second finger cancels the press, and Android's own long-press menu no longer opens a second menu. A fine pointer (a mouse) keeps the right-click menu, with no press feedback.

@vjeux
