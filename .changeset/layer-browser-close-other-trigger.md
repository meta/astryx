---
'@astryxdesign/core': patch
---

[fix] A layer with several triggers now opens at another trigger when the press on that trigger is the one that closes it, with a mouse or a finger. A press on the open trigger still closes it. For a close the browser starts itself (light dismiss, or an Escape the browser answers), `onHide` and `isOpen` now arrive when the close starts, one task earlier than before.

@cixzhang
