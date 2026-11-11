---
'@astryxdesign/core': patch
---

[feat] On a phone or tablet, TextInput, TextArea and NumberInput keep themselves above the on-screen keyboard, with nothing to turn on. A field in a page that scrolls is scrolled 10 px above the keyboard as it opens, rising with the keyboard on iOS and at once under Reduce Motion; on a page with nothing to scroll, the browser's own reveal stays. When the keyboard closes, the page or scroll area goes back to where it was, sliding down with the keyboard on iOS, unless the person scrolled it meanwhile. A field in a scrolling area is scrolled 10 px above the keyboard when the area can bring it there; otherwise the page brings it into view. A field in a bar fixed at the bottom of the viewport rides up with the keyboard, the bar's bottom on the keyboard's top, and back down when it closes, even in a bar the app owns. A field inside a fully expanded Tall BottomSheet leaves that to the sheet. In a fixed container the app positions itself, such as a full-viewport dialog, a floating bar or a bar with its own `translate`, a scroller around the field brings it above the keyboard when it can; otherwise the page brings it into view, or the browser's own reveal does. In Firefox for Android, where the page cannot scroll further, a field the page should bring into view can stay under the keyboard. Nothing changes under a mouse or a trackpad.

@vjeux
