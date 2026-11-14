---
'@astryxdesign/core': patch
---

[fix] RadioList: disabled radios stay focusable with `aria-disabled="true"` whether they are disabled individually or through the group. They remain inert and are excluded from form submission without relying on `disabledMessage`.

@azure-553
