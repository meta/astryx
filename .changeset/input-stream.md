---
'@astryxdesign/core': patch
---

[fix] The touch press feedback and the gesture recognizers now hear page-wide input through one shared stream on the window's capture phase, so an app's window-capture `stopPropagation`, or a document-capture `stopImmediatePropagation` registered before Core, no longer hides a touch from them. A recognizer that must claim a touch mid-gesture still needs the touch to reach its element. Each event type's listener is passive unless a subscriber cancels it (the gesture host's `touchend` and `contextmenu` while a claiming recognizer or press tracker is attached, the page hold's `touchmove` while it holds, and the click guard's `click` once it first arms), so a page of pressables registers no listener that can hold a scroll.

@vjeux
