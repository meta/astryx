---
'@astryxdesign/core': patch
---

[feat] MobileNav: the drawer's Close button carries `mobile-nav-close` and MobileNavToggle's Button carries `mobile-nav-toggle`, each beside Button's own target, so a theme can name them apart from other Buttons; until a part's own entry wins over the component it sits on, Button's variant, size and elevation entries still win where they set the same property. The default look does not change.

@josephfarina
