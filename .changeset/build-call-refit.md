---
'@astryxdesign/cli': patch
---

[fix] `astryx build` calls page or app shell with a refit word table and new blend numbers. The weights file stores that table once: the pick model reads the call model's tables when it carries none of its own. When the page ranker proposes no page, a page the call model's word weights choose must share a word with its own docs, or the idea keeps the app shell; the shell lift does not bring that same page back, but may still start another page.

@josephfarina
