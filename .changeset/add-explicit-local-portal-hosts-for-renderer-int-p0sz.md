---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] Declare renderer-owned DOM boundaries so decorator overlays mount outside managed content without changing safe inline hosting. RichTextEditor also mirrors its `dir` prop onto the wrapper around the editable surface, so the editing surface and its content blocks, the placeholder, UI rendered through `plugins`, and relocated overlays follow `dir`; the editing surface previously kept the surrounding direction.
@freddymeta
