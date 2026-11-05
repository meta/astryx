---
'@astryxdesign/core': patch
---

[fix] Banner: `role="alert"` now covers the urgent message only. Banner places the role on the title and description instead of the whole banner, so a screen reader no longer reads the dismiss or expand control, its tooltip, a caller's action, or the supporting content as part of the alert, and the title and description read as two parts. Other roles still land on the banner frame. Use `role="alert"` only for an urgent message, and announce every other message with `useAnnounce`.

@cixzhang
