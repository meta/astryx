---
'@astryxdesign/core': patch
---

[feat] Carousel's `hasSnap` also takes `useSnapPaging()`, from `@astryxdesign/core/SnapPaging`: iOS paging on native snap's stops, under a finger and on a trackpad swipe. A flick moves one view, or one item with `useSnapPaging({pages: 'item'})`. A mouse wheel keeps native snapping. Only a carousel given the hook's value loads the pager, and `hasSnap` alone is unchanged. (#8153)

@vjeux
