---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a finger's pull on the sheet's content at a scroll edge cancels the content's native pan as soon as the pull passes a tap's wobble (5 px), before the sheet's own drag begins at 8 px. In iOS Safari the first `touchmove` a page keeps committed the touch to the content's scroll, so a slow-starting swipe down rubber-banded the content under the finger while the sheet moved beside it. A tap that wobbles up to 5 px keeps its click; a real scroll is never cancelled.

@imdreamrunner
