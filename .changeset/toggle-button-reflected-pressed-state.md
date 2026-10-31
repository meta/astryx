---
'@astryxdesign/core': patch
---

[fix] A caller's `aria-pressed` or `data-is-pressed` no longer replaces the pressed state `ToggleButton` reflects (`architecture:public-component-api` INV5, `ToggleButton` FR12). Before, caller props were spread last, so passing either attribute made assistive technology and theme rules see a state that did not match `isPressed`. `ToggleButton` now owns `aria-pressed` and the reflected `data-is-pressed` and `data-elevation`. Other caller `data-*` attributes still reach the root.

@parinith-web
