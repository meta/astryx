---
'@astryxdesign/cli': patch
---

[fix] `astryx build` starts more whole-page ideas from a page template instead of the empty app shell. When build would start an idea on an app shell and search matched no template directly, a fixed decision over the scores build already computes (plus a fixed word table) gives a whole-page probability; at 0.30 or more, the start is build's best-ranked page template. Ideas with an edit phrase keep the shell, and block suggestions do not change. The decision picks only templates build's word tables list, so an integration's own template is never the lifted start; its other results are unchanged.

@josephfarina
