---
'@astryxdesign/core': patch
---

[feat] `createMenuPress(menu, options)` runs the menu press model on any element without React: the row under a release acts, the highlight follows a held pointer, a mouse press on `trigger` opens the menu, and a finger held on it opens it after the long-press delay. `update(options)` merges new options, which apply from the next event without ending a press in progress. `startBehavior: 'items'` starts a press only on an item, so other content in the menu keeps its own clicks. `destroy()` removes every listener it added. `useMenuPress(menuRef, options)` is its React form: `triggerRef` names the trigger, and there is nothing to spread. Its press exists only while the menu element is mounted, so a menu that opens on a press of its trigger keeps its element mounted while closed. The options form, `useMenuPress({menuRef, …})` with its `menuProps` and `triggerProps`, is deprecated; it still works as before. `DropdownMenuTriggerProps.onPointerDown` and `onContextMenu` are deprecated too: the menu listens on the trigger itself. DropdownMenu, BreadcrumbItem, NavHeadingMenu, TopNavMenu and the SideNav and TopNav heading menus move to the ref form with no change in behavior.

@vjeux
