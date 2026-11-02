---
'@astryxdesign/core': patch
---

[fix] `DropdownMenu`, `MoreMenu` and `ContextMenu` render a submenu for a data item with nested `items` inside a `{type: 'section'}`, as they do at the top level. Before, such an item rendered as a plain row with no flyout and no `aria-haspopup`, although its type allows nested `items` there; the bottom sheet on a phone already showed it as a submenu.

@cixzhang
