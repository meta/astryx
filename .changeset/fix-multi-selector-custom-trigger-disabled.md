---
'@astryxdesign/core': patch
---

[fix] MultiSelector's caller-rendered trigger exposes its disabled state and blocks caller activation handlers, including when read-only or disabled by InputGroup, while remaining focusable.
@korkt-kim
