---
'@astryxdesign/core': patch
---

[feat] A theme can now style the `ChatComposer` body for each `elevation`. The body that paints the shadow and border carries a new `chat-composer-body` target, with `data-elevation="low"` or `"none"`. The `chat-composer` target stays on the outer frame, so existing theme rules keep their element.

@cixzhang
