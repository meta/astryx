---
'@astryxdesign/core': patch
---

[feature] NavHeadingMenu, TopNavMenu, SideNavHeading's menu, TopNavHeading's product menu, BreadcrumbItem's menu and TabMenu track a held pointer across their items, as DropdownMenu does: a press (finger, pen or mouse) that slides across the items acts on the one it lifts on, once, with the highlight following the pointer, and a mouse released outside closes the menu. A link item is no longer draggable, so a mouse press that slides to another item is not a drag. Keyboard and assistive-technology behavior is unchanged. No API changes.

@cixzhang
