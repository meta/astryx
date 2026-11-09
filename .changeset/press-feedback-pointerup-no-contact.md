---
'@astryxdesign/core': patch
---

[fix] Press feedback: a `pointerup` that carries no `pointerId`, such as a bare event a test helper or drag script dispatches, no longer throws `Cannot read properties of null (reading 'live')` when no press is held. It is ignored, as `pointercancel` already does.

@harjothkhara
