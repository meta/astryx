---
'@astryxdesign/core': patch
---

[fix] Tooltip: a disabled reason is the only tooltip its control shows. While a component shows a disabled reason on a control (a field disabled with `disabledMessage`, for example), any other tooltip on that control, inside it, or wrapped around it stays closed and adds nothing to the control's accessible description, so the reason is shown and announced alone. When the reason goes away, the other tooltip works again; a tooltip you control with `isOpen` keeps your value. No API change.

@cixzhang
