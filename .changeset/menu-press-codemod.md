---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` moves `useMenuPress({menuRef, …})` calls to the ref form, `useMenuPress(menuRef, options)`, and drops the spreads of its `menuProps` and `triggerProps`. It also drops a DropdownMenu trigger's plain forwards of the deprecated `onPointerDown` and `onContextMenu`. Where it cannot prove the result, it leaves the code unchanged with a TODO.

@vjeux
