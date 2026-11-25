---
'@astryxdesign/core': patch
---

[feat] `createReorderable` objects have an `attach(container, {items})` method that reorders plain elements you render, without a collection component. `items()` returns each item's `key`, `element` and `handle` in order. Each handle becomes a reorder mode toggle named for its item: Space or Enter turns the mode on, the arrow keys move the item, Escape ends it, and screen readers hear each move. A move you do not apply by the end of the task is refused and announced. `start(key)` reaches attached items, and `detach()` removes everything `attach` added. Attached items move up and down; dragging an attached handle with a pointer or a finger comes in a later release.

@cixzhang
