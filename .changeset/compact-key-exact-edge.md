---
'@astryxdesign/core': patch
---

[fix] Core's compact StyleX media key matched at exactly the `md` width point (768px) and at exactly 500px tall, because StyleX rewrites `(width < 768px)` to a length the browser rounds up to 768px. The key now matches only below those edges, as the compact definition says, and Core spells every range-syntax width and height edge through one set of helpers. No component uses the key yet, so nothing changes on screen.

@josephfarina
