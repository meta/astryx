---
'@astryxdesign/core': patch
---

[fix] FileInput with `statusVariant="tooltip"` keeps its status button, and the message it reveals, in dropzone mode and while the field is busy (loading or uploading), instead of dropping it and leaving the field's description pointing at nothing.

@cixzhang
