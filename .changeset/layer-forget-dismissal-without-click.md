---
'@astryxdesign/core': patch
---

[fix] After a press outside closes a menu, popover or other light-dismiss layer and then brings no click (a press the browser cancels, such as a touch that turns into a scroll, or a release that composes no click), the trigger opens the layer again on its next activation. A bare click, as assistive technology sends it, is no longer refused as part of the press that closed the layer. The click a closing press brings is still absorbed, so a press on the trigger still only closes the layer.

@cixzhang
