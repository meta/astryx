---
'@astryxdesign/core': patch
---

[feat] `List` takes `animatedLayout`, the handle from `useAnimatedLayout({containerRef})`, and `ListItem` takes `itemKey`, the row's identity. With the handle, when rows are inserted, removed or reordered, an inserted row enters, a removed row (a swiped one with its action showing) collapses in place, and a row that crosses rows moving the other way rides above them with the surface color behind it, as an iOS table's opaque cell does. The rows after a change and the content after the list, up to the handle's container, glide to their new places. All of it runs on one shared motion and starts together, under every pointer; under Reduce Motion nothing travels. A row without an `itemKey` changes at once, and without the handle the whole list does.

@vjeux
