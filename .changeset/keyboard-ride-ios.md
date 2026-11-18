---
'@astryxdesign/core': patch
---

[feat] In Safari on iOS, ChatLayout's composer and a Tall BottomSheet's focused field ride the on-screen keyboard on UIKit's own keyboard motion. They rise from Safari's report as the keyboard starts up; before, they moved up in one step. The composer also goes down from the blur that takes the keyboard down, as the sheet already did. The ride starts once the page has loaded Core's touch support, shortly after first paint; before that, they move in one step. Chrome on Android and Firefox for Android are unchanged. Under Reduce Motion nothing travels.

@vjeux
