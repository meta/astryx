---
'@astryxdesign/core': patch
---

[feat] Under a finger, a full swipe on an `Item` or `ListItem` swipe-action row works like a UIKit list row's, the same on every touch device. Past the open width the entries ride the row and the outermost action stretches out to the edge. Dragged on past the confirm point (judged on the finger, as UIKit does) the row runs ahead and the outermost action covers its place, and letting go there fires it at any speed; backing out undoes that and closes the row. A disabled outermost action never confirms.

@vjeux
