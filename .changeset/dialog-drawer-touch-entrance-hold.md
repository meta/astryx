---
'@astryxdesign/core': patch
---

[fix] On a touch screen, a tap or a drag that lands while a `Dialog` or a `Drawer` is still entering no longer closes it, runs one of its actions, moves focus or scrolls the page: it reaches nothing until the entrance has played, and the dialog or drawer finishes entering and stays open. Around a `Drawer` without a scrim only a tap or a drag on the panel is held, and the page stays live. Keys and assistive technology stay live during the entrance, the content stays in the accessibility tree, a pinch still zooms the page, and a mouse or a trackpad still clicks.

@vjeux
