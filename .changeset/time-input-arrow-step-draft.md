---
'@astryxdesign/core': patch
---

[fix] `TimeInput` shows the stepped time after an arrow-key adjustment made while a typed draft is pending, and leaving the field keeps that step. Before, the text typed before pressing ArrowUp or ArrowDown stayed in the box while the committed value and the screen-reader announcement had moved on, and blurring re-parsed that stale text and committed it over the step, silently undoing it.

@thecodebasedot
