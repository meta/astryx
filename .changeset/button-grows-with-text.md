---
'@astryxdesign/core': patch
---

[fix] A labelled `Button` grows with its label when the text size grows: its height is its size, or one line of its label when that is taller, so the label stays inside the button. At the default text size Buttons render exactly as before, a caller's `height` still applies, and icon-only buttons keep their fixed square.

@cixzhang
