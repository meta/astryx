---
'@astryxdesign/core': patch
---

[fix] A `BreadcrumbItem` link or button inside the AppShell mobile drawer now closes the drawer after it runs `onClick`, like the `TopNavItem` and `SideNavItem` rows beside it. Before, a crumb navigated and left the drawer open over the new page. A crumb marked `isCurrent`, which goes nowhere, leaves the drawer open. (#9465)

@cixzhang @duytbp
