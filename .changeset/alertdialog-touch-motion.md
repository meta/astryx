---
'@astryxdesign/core': patch
---

[feat] AlertDialog: under a finger the alert appears and leaves the way an iOS alert does. It scales down into place from 1.2 while it and the dimming fade in, on the theme's entrance timing. When it closes it fades out with the dimming, on the theme's exit timing, and a close or a reopen midway turns back from where it is. While it appears a touch does nothing, and keys and assistive technology still act. While it leaves nothing reaches it, but a toast its action raised stays live and its words are read. With reduced motion it only cross-fades. On a phone (a compact window under a coarse pointer) the width with no `width` prop goes from 400 px to 320 px in every theme; a `width` you pass still wins. With a mouse nothing changes.

@vjeux
