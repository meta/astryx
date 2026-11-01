---
'@astryxdesign/core': patch
---

[fix] `TopNavMenu` and `TopNavMegaMenu` now forward their `ref` to the trigger button in drawer mode (`architecture:public-component-api` INV8). Before, only the desktop popover trigger received the ref, so a caller's ref stayed empty whenever the menu rendered inside the mobile drawer. Apps need no code change; the desktop trigger and every other prop are unchanged.

@parinith-web
