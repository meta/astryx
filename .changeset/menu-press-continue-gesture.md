---
'@astryxdesign/core': patch
---

[feat] `useMenuPress` returns `continueGesture(pointer)`, and `@astryxdesign/core/hooks` exports its `MenuPressContinuation` type. A menu that opens under a pointer that went down elsewhere, such as a long press on another element, hands that pointer to the menu: the same finger can then slide onto a row and pick it on release (`module:DropdownMenu/useMenuPress` FR11).

@vjeux
