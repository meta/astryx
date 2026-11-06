---
'@astryxdesign/core': patch
---

[perf] On a touch screen, a control that grows its touch target toward 44 px (CheckboxInput, RadioList, Switch, List rows, InfoTip, action groups) measures its neighbours in a shared pass. Each pass used to match every element on the page against the list of interactive selectors. The pass now keeps that list until an element is added, removed or moved, an attribute the list reads changes, or a control starts or stops its watch. It still reads every neighbour's box in each pass, so the touch targets are the same. Measured in Chromium at 4× CPU slowdown on a page with 240 interactive elements, a pass during a scroll took about 70% less time.

@cixzhang
