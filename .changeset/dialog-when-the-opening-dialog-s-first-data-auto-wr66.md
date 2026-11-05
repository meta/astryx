---
'@astryxdesign/core': patch
---

[fix] Dialog: when the opening Dialog's first data-autofocus request is hidden, inert, or `aria-hidden` inside the dialog, or cannot take focus, the next request takes it; a header's default title request comes after every explicit request. This also holds for a Dialog rendered inside an inert region of the page or in an iframe or Picture-in-Picture window (#4182)
@jiunshinn
