---
'@astryxdesign/core': patch
---

[fix] Text in an open MobileNav, Dialog, Drawer or BottomSheet that sets no color of its own (such as a selected nav row) now draws in the theme's text color. Core's reset gives every dialog the page's text color in place of the browser's, which ignored the theme and drew black on dark panels. A Toast's text takes the side that reads best on its card, so a dark-mode error toast reaches 4.5:1 where the page's text read only about 4:1.

@josephfarina
