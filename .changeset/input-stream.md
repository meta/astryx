---
'@astryxdesign/core': patch
---

[fix] The gesture recognizers now hear page-wide input through one shared stream on the window's capture phase, where the touch press feedback's pointer listeners already were, so an app's window-capture `stopPropagation`, or a document-capture `stopImmediatePropagation` registered before Core, no longer hides a touch from them. The press feedback's scroll and visibility listeners join the same stream. A recognizer that must claim a touch mid-gesture still needs the touch to reach its element. Each event type's listener is passive unless a subscriber cancels it (the gesture host's `touchend` and `contextmenu` while a claiming recognizer or press tracker is attached, the page hold's `touchmove` while it holds, and the click guard's `click` while it is armed, and from the menu press model's first arm on), so a page of pressables registers no listener that can hold a scroll.

@vjeux
