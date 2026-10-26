---
'@astryxdesign/core': patch
---

[chore] Internal: the UIKit gesture thresholds are one export per recognizer (`UIKIT_TAP`, `UIKIT_PAN`, `UIKIT_PRESS`, …), so a touch component bundles only the group it reads. The table's notes say that the status-bar scroll-to-top does not coast under Reduce Motion and that UIKit's Reduce Motion menu spring is never played. No behavior change.

@cixzhang
