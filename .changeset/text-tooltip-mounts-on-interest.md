---
'@astryxdesign/core': patch
---

[fix] A truncated Text or Heading mounts its tooltip on the first hover, tap or focus, not as soon as it renders, so a long table or list of truncated cells mounts no closed tooltip layers at load. That first interaction opens the tooltip as it would once mounted. No visual change.

@cixzhang
