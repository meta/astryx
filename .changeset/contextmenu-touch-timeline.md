---
'@astryxdesign/core': patch
---

[feat] ContextMenu opens from a held finger on iOS 26's measured timeline where the primary pointer is coarse. A block trigger whose menu opens at the finger starts to grow 150 ms after the finger lands, toward its held size on UIKit's lift spring, played on the compositor, and the hold keeps UIKit's measured moments. At 400 ms the press takes the finger: its lift no longer sends a click, and the page cannot scroll under it. The menu opens at 735 ms if the finger is still down, or as soon as it lifts after 400 ms. A finger that lifts before 400 ms, or drifts more than 11.5 px on either axis before the menu opens, gets no menu, and the trigger springs back to its size. The page stays free to scroll while the menu is up: a touch outside the menu closes it as it begins to pan, or at its lift. The trigger returns to its size when the menu closes. A touch open lights no row: the menu takes the focus, and a row lights only under the finger, as in UIKit (keyboard and pointer opens still focus the first item). A second finger cancels the press before 400 ms; after it, the menu still opens. A fine pointer (a mouse) keeps the right-click menu, and a finger there keeps today's 500 ms long press. Pass `presentation="popover"` to keep today's menu: the menu at the pointer, opened by a finger held for 500 ms.

@vjeux
