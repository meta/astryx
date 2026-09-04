---
'@astryxdesign/core': patch
---

[fix] Render a plain Link anchor as `inline` so an ancestor `<Text maxLines>` clamp can truncate it; flex layout is kept for the external-link icon and button forms, and Link/Text docs now cover the external-link clamp limitation. (#6021)
@ManoharPaturi
