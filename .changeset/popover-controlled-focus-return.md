---
'@astryxdesign/core': patch
---

[fix] A controlled Popover that moves focus inside when it opens returns focus to its trigger again when it closes. Opened from the keyboard and closed by Escape or by a choice inside it, it left focus on the page instead.

@vjeux
