---
'@astryxdesign/core': patch
---

[fix] Toast: the viewport is each toast's only announcement owner. While an open modal hosts a top-layer viewport (the default), it announces each toast through that modal's own live regions, so a toast shown over a Dialog is announced once. Elsewhere it announces through the shared channel. A viewport rendered in place announces through `useAnnounce`, which delivers inside an enclosing Astryx modal. The toast card is no longer a live region inside a viewport, including while a modal hosts it.

@cixzhang
