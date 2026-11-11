---
'@astryxdesign/core': patch
---

[fix] A swizzled AppShell or ScrollableArea now sees the scroll regions the package's components register, and the reverse. Before, each copy kept its own record of registered scroll regions, so an outer region's keyboard scrolling did not yield to an inner region from another copy unless the inner one was already overflowing. No API changes.

@cixzhang
