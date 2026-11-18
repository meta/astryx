---
'@astryxdesign/core': patch
---

[fix] Token: an app can give the Remove button its own accessible name through the optional `removeButtonLabel` prop in the static, clickable, and link-with-remove structures. Without it, the button keeps the translated "Remove {label}" name.

@aashish254
