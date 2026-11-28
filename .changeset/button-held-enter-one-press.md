---
'@astryxdesign/core': patch
---

[fix] Button, IconButton, ToggleButton: a held Enter key is one press. A native button clicks on every auto-repeated Enter keydown, so holding Enter on a ToggleButton flipped it about 30 times a second and left it in whichever state the key came up on, and on a Button it ran `onClick` or `clickAction` over and over. The repeats are cancelled, and a caller's `onKeyDown` still sees them. (#8944)

@HelloOjasMutreja
