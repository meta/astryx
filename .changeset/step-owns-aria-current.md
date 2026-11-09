---
'@astryxdesign/core': patch
---

[fix] A `Step` keeps its own `aria-current` over a caller's. Before, an `aria-current` passed to a `Step` replaced the reflected value, so a step that was not in progress could be marked current and the in-progress step could lose `aria-current="step"`. Now only the in-progress step carries `aria-current="step"`, whatever the caller passes. No API changes.

@parinith-web
