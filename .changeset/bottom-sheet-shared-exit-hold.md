---
'@astryxdesign/core': patch
---

[chore] Internal: a closing BottomSheet now takes the layer runtime's shared input hold, through its new `focus: 'kept-inside'` mode, instead of its own exit rules. The sheet behaves as before: the page stays live, a sheet that keeps focus takes no click and no key but Tab, and the sheet is inert and hidden once focus leaves.

@cixzhang
