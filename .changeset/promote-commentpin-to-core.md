---
'@astryxdesign/core': patch
---

[component] Promote `CommentPin` to Core, imported from `@astryxdesign/core/CommentPin` or the package root together with `CommentUser`, the person record its participants take. CommentPin is the avatar-first button that anchors a comment thread, or a group of threads, over content or in a content margin. A single pin shows its lead participant; a group shows up to three participant circles and the thread total. An accent dot marks unread threads. Three sizes follow the element-size scale. Activation flips the selection, which the pin keeps, or the host controls through `isSelected` and `onSelectedChange`. The host owns anchors, grouping, and which pins render.

@ernestt
