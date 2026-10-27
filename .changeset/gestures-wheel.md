---
'@astryxdesign/core': patch
---

[chore] Internal: a pan takes wheel and trackpad scrolling it allows (`allowedScrollTypes`, UIKit's `allowedScrollTypesMask`, none by default), along its own axis and after the scrollers under the pointer, and a pinch takes a ctrl-wheel, as a trackpad pinches (AST-094 FR43). Not exported from the package entry point.

@vjeux
