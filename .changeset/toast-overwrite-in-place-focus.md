---
'@astryxdesign/core': patch
---

[fix] `Toast`: a toast updated through `uniqueID` (`collisionBehavior: 'overwrite'`) now updates in place, so focus on its controls stays put instead of dropping to the page. If the update removes the focused control, or a dismissed toast leaves only toasts with no controls, focus returns to where it was before entering the toasts.

@cixzhang @duytbp
