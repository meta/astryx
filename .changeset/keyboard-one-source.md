---
'@astryxdesign/core': patch
---

[fix] BottomSheet reads the on-screen keyboard from core's shared keyboard module. It now takes over focus moves into a fully expanded Tall sheet wherever a top-level document has a visual viewport and the primary pointer is coarse, Chrome and Firefox on Android included, instead of only under an iOS user agent. A pinch zoom no longer reads as a keyboard, and a pinch-zoomed page still reads the keyboard's full height. The sheet lays its keyboard room out through its own style rather than a CSS custom property. The browser-support guide documents Chrome on Android's `interactive-widget` viewport setting. (#8559)

@vjeux
