---
'@astryxdesign/core': patch
---

[feat] `createResizable(handle, options)` makes a plain element a window splitter that resizes a region, without React: a pointer drag that holds its pointer across embedded frames, the arrow keys, Home, End, Enter and a double-click, with bounds, snap points, collapse and saved sizes. It reports the size through `subscribe` and `onSizeChange`, and you size the panel; `destroy` removes every listener and attribute it added. `useResizable(handleRef, options)` is its React form, beside the configuration-object form: give the same ref to `ResizeHandle` (or to a plain element) and render the panel at `size`; a plain element is named and announced through the message catalog. `ResizeHandle` and the configuration-object form go through the same implementation, with their behavior unchanged.

@vjeux
