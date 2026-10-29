---
'@astryxdesign/core': patch
---

[feat] Carousel: under a finger, a `hasSnap` carousel with its buttons pages like an iOS paging scroll view. Each swipe moves one child and settles on that child's start edge on UIKit's paging curve; the content follows the finger and rubber-bands at the ends, even while JavaScript is busy. A mouse, a trackpad and the keyboard keep native snapping, and so does a finger without the buttons, because the buttons are the single-pointer way to page.

This changes existing `hasSnap` carousels on touch screens. A fast swipe now moves one child instead of coasting across several, and while the touch pager runs the content does not scroll natively: it fires no `scroll` events and its `scrollLeft` stays 0. To keep native scrolling under a finger, render the carousel with `hasButtons={false}`. The buttons and the handle keep their step of about one viewport, landing on a child; with `hasLoop`, Next on the last child returns to the first, as it already did with a pointer. Under Reduce Motion a programmatic scroll cross-fades on a coarse pointer and jumps at once on any other.

@vjeux
