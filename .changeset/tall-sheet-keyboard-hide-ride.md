---
'@astryxdesign/core': patch
---

[fix] BottomSheet: in iOS Safari, which publishes no keyboard slide, when the on-screen keyboard closes, a Tall sheet's content rides down with it on UIKit's keyboard spring, instead of jumping back to its earlier scroll once the keyboard is gone. A field that takes focus again before the keyboard is down rides back up, and focus moving to a select, whose picker takes the keyboard's place, starts no ride. In Chrome on Android, a busy page that reads the keyboard's hide late no longer moves the content back up before it settles.

@vjeux
