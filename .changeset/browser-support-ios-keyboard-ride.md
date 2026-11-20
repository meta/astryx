---
'@astryxdesign/cli': patch
---

[docs] The browser-support guide's on-screen keyboard section describes the ride in Safari on iOS. ChatLayout's composer, a Tall BottomSheet's focused field and a TextInput, TextArea or NumberInput in an app's docked bar wait for the keyboard's top. Then they rise with it on a spring a touch quicker than UIKit's keyboard motion. The scroll room stays until Safari reports the keyboard gone. The ride starts once the page has loaded Core's touch support.

@vjeux
