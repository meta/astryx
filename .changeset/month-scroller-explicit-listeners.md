---
'@astryxdesign/core': patch
---

[chore] The date picker's month scroller attaches and removes its four input listeners directly, each with one shared options object, instead of looping over an array of event names and creating an options object on every attach. Behavior is unchanged. The scroller and its listeners come from @vjeux's month scroller fix.

@cixzhang @vjeux
