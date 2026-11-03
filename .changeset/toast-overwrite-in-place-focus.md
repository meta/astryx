---
'@astryxdesign/core': patch
---

[fix] `Toast`: a toast updated through `uniqueID` (`collisionBehavior: 'overwrite'`) now updates in place, so focus on its controls stays put instead of dropping to the page. If the update removes the focused control, focus moves to a control in the toasts (such as a dismiss button) or, with none, back to where it was before entering the toasts. Dismissing a focused toast when only toasts without controls remain also returns focus there. An update that makes a toast auto-hide keeps its timer held while focus is inside it. Outside a modal, toasts in a `ToastViewport` no longer carry their own live region, so each toast and each update is announced once, by the viewport; while a modal hosts the viewport, each toast announces itself, because the modal hides the viewport's channel.

@cixzhang @duytbp
