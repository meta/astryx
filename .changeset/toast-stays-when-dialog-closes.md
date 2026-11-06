---
'@astryxdesign/core': patch
---

[fix] A toast shown over a `Dialog` no longer blinks out for a frame or more when the Dialog closes outside a click, for example when it closes once an awaited save finishes. The toast stays on screen while the Dialog closes. A close from a click, the Escape key or the backdrop already kept it.

@vjeux
