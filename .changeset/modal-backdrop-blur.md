---
'@astryxdesign/core': patch
---

[feat] Dialog (and so AlertDialog), Drawer and MobileNav no longer blur the page behind the modal, under every pointer: the 2px full-viewport backdrop blur is costly to repaint. The dim keeps the theme's `--color-overlay`, and in forced colors the modal keeps an edge so it still stands apart from the page. BottomSheet never blurred. A theme keeps the blur by setting `backdropFilter: 'blur(2px)'` on the component's modal backdrop: `components.dialog.base['::backdrop']`, `components['mobile-nav'].base['::backdrop']`, and for Drawer `components.drawer.base[':modal::backdrop']`, which leaves a non-modal drawer (`hasScrim={false}`) unblurred.

@vjeux
