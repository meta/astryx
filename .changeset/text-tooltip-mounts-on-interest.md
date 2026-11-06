---
'@astryxdesign/core': patch
---

[fix] A truncated Text or Heading mounts its tooltip on the first hover, tap or focus, not as soon as it renders, so a long table or list of truncated cells mounts no closed tooltip layers at load. The hover delay, the tap and the focus rules are the tooltip's own: a touch that becomes a scroll opens nothing, and a tap outside closes it. No visual change.

@cixzhang
