---
'@astryxdesign/core': patch
---

[feat] On the web, a trackpad scrolling over a BottomSheet's handle, or past its content, pulls the sheet as a drag does, at most the sheet's height below where it rests. A mouse wheel never moves the sheet: it scrolls the content. A sheet a swipe can't dismiss (a `form` or `required` sheet) now stretches on a rubber band when a finger or a trackpad pulls it below its rest, and springs back; a mouse or a pen drag keeps tracking it one to one.

@vjeux
