---
'@astryxdesign/core': patch
---

[chore] Internal: a pan takes wheel and trackpad scrolling by default, a mouse wheel's notches included (`allowedScrollTypes`, UIKit's `allowedScrollTypesMask`; `[]` opts out), along its own axis and after the scrollers under the pointer; the screen-edge pan takes none; and a pinch takes a ctrl-wheel, as a trackpad pinches (AST-094 FR43). A watcher pan never takes the wheel, and a wheel another handler already prevented stays the page's. Input the deltas cannot place reads as a mouse wheel; a trackpad scroll a pan follows ends where its fingers lift into momentum, keeping their speed, and the momentum never moves it; and a pan created with `wheelStep` takes a trackpad swipe as one step. Not exported from the package entry point.

@vjeux
