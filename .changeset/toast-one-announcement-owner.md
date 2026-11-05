---
'@astryxdesign/core': patch
---

[fix] Toast: the viewport is each toast's only announcement owner. A top-layer viewport (the default) announces each toast through its own persistent polite and assertive regions, which move with it into an open modal, so a toast shown over a Dialog is announced once. A viewport rendered in place announces through `useAnnounce`, which delivers inside an enclosing Astryx modal. The toast card is no longer a live region inside a viewport, including while a modal hosts it.

@cixzhang
