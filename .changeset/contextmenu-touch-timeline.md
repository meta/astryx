---
'@astryxdesign/core': patch
---

[feat] ContextMenu opens from a held finger on iOS 26's measured timeline, on every touch device (a coarse primary pointer, iOS and Android alike). The trigger starts to grow at 150 ms (the onset of core's one press machine), following UIKit's measured press curve on the compositor, and the hold runs on useLongPress's detector with UIKit's measured moments. At 400 ms the press takes the finger: its lift no longer sends a click, and the page cannot scroll under it. The menu opens at 735 ms if the finger is still down, or as soon as it lifts after 400 ms. A finger that lifts before 400 ms, or drifts more than 11.5 px on either axis before the menu opens, gets no menu, and the trigger springs back. The page stays still while the menu is up, and the trigger returns to its size when the menu closes. A theme can retune the growth's spring and latency (motion roles). A touch open lights no row: the menu takes the focus, and a row lights only under the finger, as in UIKit (keyboard and pointer opens still focus the first item). A second finger cancels the press, and Android's own long-press menu no longer opens a second menu. A fine pointer (a mouse) keeps the right-click menu, and the touch recognizer stays off there.

@vjeux
