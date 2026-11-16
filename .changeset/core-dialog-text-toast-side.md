---
'@astryxdesign/core': patch
---

[fix] Text that sets no color of its own (such as a selected nav row) in an open MobileNav, Dialog, Drawer or BottomSheet now draws in the theme's text color. Before, it took the browser's dialog default, which ignores the theme and drew black on dark panels. A Toast's text takes the side that reads best on its card, and the default top-layer viewport passes the page's text color down instead of the browser's. A dark-mode error toast now reaches 4.5:1. Before, it read about 4:1 in an in-place viewport.

@josephfarina
