---
'@astryxdesign/core': patch
---

[fix] DialogHeader: a header that mounts while its dialog is already open no longer takes focus from a control inside the dialog. A step that swaps its header no longer moves the caret out of the field the person is typing in. When nothing inside the dialog holds focus (content that loads after the dialog opens), the new title still takes focus.

@nynexman4464
