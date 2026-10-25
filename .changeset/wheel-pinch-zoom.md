---
'@astryxdesign/core': patch
---

[fix] A two-finger pinch over an open picker wheel zooms the page again. The wheels in the TimeInput, DateTimeInput and DateInput bottom sheets accepted vertical pans only, which also refused the browser's pinch-zoom, so the page could not be zoomed over an open picker. They now leave the pinch to the page, as the menus and listboxes already do. Scrolling a wheel is unchanged.

@vjeux
