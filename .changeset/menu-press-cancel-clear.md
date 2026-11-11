---
'@astryxdesign/core': patch
---

[fix] After the window loses focus during a finger's press, lifting that finger no longer acts on any menu (DropdownMenu, MoreMenu, ContextMenu, Selector, and menus built on the public `useMenuPress`), and a tap on a menu's trigger still opens it. Under a finger, a row lit by a press that is cancelled (a scroll, a second finger, the window losing focus) now clears, as on iOS (`spec:AST-094` FR28). It clears in DropdownMenu and its sub-menus under any `presentation`, MoreMenu, ContextMenu, Selector's list and the bottom sheet's action list, and in a menu built on the public `useMenuPress` whose root can take focus. A mouse keeps its highlight.

@vjeux
