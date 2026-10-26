---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, MoreMenu and ContextMenu: a menu presented as a bottom sheet (`presentation="bottom-sheet"`, or `"adaptive"` on a phone) no longer keeps its closed sheet and every item mounted while the menu is closed. The sheet mounts as it opens and unmounts after its exit, with focus still returning to the trigger. The open sheet also renders two fewer wrapper elements, with the same layout.

@cixzhang
