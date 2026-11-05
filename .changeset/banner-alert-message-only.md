---
'@astryxdesign/core': patch
---

[fix] Banner: `role="alert"` now sits on the title and description only, not on the whole banner, so the dismiss and expand controls, their tooltips, a caller's action, and the supporting content are outside the alert. ARIA attributes passed with `role="alert"`, such as `aria-label`, move with it. Other roles still land on the banner frame. Use `role="alert"` only for an urgent message, and announce every other message with `useAnnounce`.

@cixzhang
