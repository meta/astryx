---
'@astryxdesign/core': patch
---

[fix] A backdrop press that closes a menu or popover open inside a `Dialog` (`purpose="info"`), a `Drawer` with its scrim, or `CommandPalette` now closes only that menu or popover. The next backdrop press closes the dialog, as a second Escape does. Fixes #9920.

@cixzhang
