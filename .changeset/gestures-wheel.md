---
'@astryxdesign/core': patch
---

[chore] Internal: a pan follows a trackpad's two-finger scroll where its owner allows it (`allowedScrollTypes: ['continuous']`, UIKit's `allowedScrollTypesMask`; none by default), along its own axis and after the scrollers under the pointer, and never a mouse wheel's notches, which scroll what is under the pointer; the screen-edge pan takes none; and a pinch takes a ctrl-wheel from a trackpad or a mouse (AST-094 FR43, DEC-24). A watcher pan never takes the wheel, and a wheel another handler already prevented stays the page's. Input the deltas cannot place, Shift+wheel included, reads as a mouse wheel; a trackpad scroll a pan follows keeps moving at the fingers' speed until their lift is read, ends there still moving, and the momentum never moves it. Not exported from the package entry point.

@vjeux
