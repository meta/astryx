---
'@astryxdesign/core': patch
---

[fix] A `Toast` rendered on its own, outside a `ToastViewport`, no longer holds a live role, so a screen reader does not read it a second time when its caller announces the message. Its text stays readable in browse mode. Only the viewport announces a toast; a caller that renders a `Toast` on its own owns its announcement.

Reported by:

@duytbp
