---
'@astryxdesign/core': patch
---

[fix] SideNav, TopNav, Breadcrumbs: a Ctrl-, Cmd-, Shift- or Alt-click on a link in the mobile navigation drawer opens it the way the browser decides, a new tab for instance, and leaves the drawer open. A plain click still closes it, and so does a modified click that the row's own `onClick` cancels, since nothing opens elsewhere. (#8979)
@HelloOjasMutreja
