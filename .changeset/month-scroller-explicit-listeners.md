---
'@astryxdesign/core': patch
---

[perf] The date picker's month scroller attaches and removes its four input listeners directly and shares one options object, instead of looping over an array of event names and allocating options on every attach. Behavior is unchanged. The scroller's listeners were written by @vjeux.
