---
'@astryxdesign/core': patch
---

[fix] Disabled Buttons, including IconButton, ToggleButton, and group members, now keep focus and their enabled Tab eligibility with `aria-disabled` instead of native `disabled`. Activation callbacks, Actions, form submission/reset, and link navigation remain blocked. Link-mode Buttons preserve the mounted anchor and custom router ref through disablement; busy-only controls retain their pending appearance. Fully disabled roving groups keep one focusable entry, while hidden Carousel edge actions remain outside Tab order and the accessibility tree.

Use `[aria-disabled="true"]` rather than `:disabled` or native-disabled test assertions when selecting disabled Buttons.

@korkt-kim
