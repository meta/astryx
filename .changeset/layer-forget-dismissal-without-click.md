---
'@astryxdesign/core': patch
---

[fix] After a press outside closes a menu, popover or other light-dismiss layer and then brings no click (a drag that ends off the page's controls, or a touch the browser cancels), the trigger opens the layer again on its next activation. A bare click, as assistive technology sends it, is no longer refused as part of the press that closed the layer. The click a closing press brings is still absorbed, so a press on the trigger still only closes the layer.
