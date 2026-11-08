---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] **ChatLayout**: In a page that scrolls the document (`scrollRef`), the composer stays right above the software keyboard in Safari on iOS, instead of jumping under the status bar. In Firefox for Android, the first keyboard show on each page covers the composer for up to about 0.7 s before it rises.
@vjeux
