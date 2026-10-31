---
'@astryxdesign/core': patch
---

[chore] Internal: a pan takes wheel and trackpad scrolling by default, a mouse wheel's notches included (`allowedScrollTypes`, UIKit's `allowedScrollTypesMask`; `[]` opts out), along its own axis and after the scrollers under the pointer; the screen-edge pan takes none; and a pinch takes a ctrl-wheel, as a trackpad pinches (AST-094 FR43). A watcher pan never takes the wheel, and a wheel another handler already prevented stays the page's. Not exported from the package entry point.

@vjeux
