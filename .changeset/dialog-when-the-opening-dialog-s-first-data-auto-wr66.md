---
'@astryxdesign/core': patch
---

[fix] Dialog: when the first `data-autofocus` request is hidden, inert, `aria-hidden` or cannot take focus, the next eligible request takes initial focus. This also holds for a Dialog rendered inside an inert region of the page or in an iframe or Picture-in-Picture window (#4182)

@jiunshinn
