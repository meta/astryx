---
'@astryxdesign/core': patch
---

[fix] In Safari on iOS, ChatLayout's composer and a Tall BottomSheet's focused field wait until the keyboard's top reaches them, then rise with it. Before, a surface that rests above the keyboard's start floated up ahead of it. The rise rides a spring a little quicker than UIKit's keyboard, which offsets part of Safari's late report. The hide keeps UIKit's keyboard motion. Chrome on Android and Firefox for Android are unchanged. Under Reduce Motion nothing travels.

@vjeux
