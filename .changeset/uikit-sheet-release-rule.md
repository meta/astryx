---
'@astryxdesign/core': patch
---

[chore] Internal: the rule a BottomSheet release will follow, measured from UIKit on iOS 26.2, as a pure function. It picks the stop nearest the sheet's offset plus its velocity × 0.1 s (below 250 pt/s, the stop nearest its offset), counting gone below the screen as a stop; from 1008 pt/s a flick goes at least to the next stop in its direction, on the 0.8-damped release spring. A release moving back toward where its drag began returns to the detent nearest that start, and never dismisses. It lands where UIKit did on 149 of 164 measured releases; the other 15 moved back toward their start, where UIKit settled 14 on the stop nearest them and flicked one to large. Not exported from the package entry point.

@vjeux
