---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a finger's pull on the sheet's content at a scroll edge cancels the content's native pan as soon as the pull reaches a tap's wobble (5 px), before the sheet's own drag begins at 8 px. In iOS Safari the first `touchmove` a page keeps committed the touch to the content's scroll, so a slow-starting swipe down rubber-banded the content under the finger while the sheet moved beside it. A tap that wobbles less than 5 px keeps its click, while a tap that wobbles 5 to 8 px toward the edge now loses it. A real scroll is never cancelled. A mostly sideways swipe on a horizontal row is not cancelled before the sheet's drag begins; a first move past 8 px starts the drag in any direction, as before.

@imdreamrunner @cixzhang
