---
'@astryxdesign/core': patch
---

[feat] In Safari on iOS, ChatLayout's composer, a Tall BottomSheet's focused field and a TextInput, TextArea or NumberInput in an app's docked bar ride the on-screen keyboard. Before, they moved up in one step at Safari's report. Each now waits until the keyboard's top reaches it, then rises with it on a spring a touch quicker than UIKit's own keyboard motion. The composer and the docked bar also go down with the keyboard from the blur that takes it down, as the sheet already did. The ride starts once the page has loaded Core's touch support, shortly after first paint; before that, they move in one step. Chrome on Android and Firefox for Android are unchanged. Under Reduce Motion nothing travels.

@vjeux
