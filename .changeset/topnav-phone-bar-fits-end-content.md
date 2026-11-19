---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] On a phone, TopNav's end content is never wider than the bar, so an end item that can narrow, like a search field, narrows and the menu button stays in view. The Shell Nav template's search now narrows on a phone instead of pushing the menu button off screen at 375 px.

@josephfarina
