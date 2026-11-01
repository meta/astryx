---
'@astryxdesign/core': patch
---

[feat] `createResizable(handle, options)` makes a plain element a window splitter that resizes a region, without React: a pointer drag that holds its pointer across embedded frames, the arrow keys, Home, End, Enter and a double-click, with bounds, snap points, collapse and saved sizes. It reports the size through `subscribe` and `onSizeChange`, and you size the panel; `destroy` removes every listener and attribute it added. The handle is named and announced with the message catalog's English messages, unless you pass `label`. `useResizable(handleRef, options)` is its React form.

@vjeux
