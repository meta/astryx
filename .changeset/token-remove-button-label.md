---
'@astryxdesign/core': patch
---

[fix] Token: a token's remove button can take its own accessible name, so several tokens that share a label no longer get identical remove buttons. The new optional `removeButtonLabel` prop names the remove button in every structure (static, clickable, link, and link with remove); without it the button keeps the translated "Remove {label}" name.

@aashish254
