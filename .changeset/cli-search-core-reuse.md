---
'@astryxdesign/cli': patch
---

[fix] The lexical ranker behind `astryx build`'s search ranks the candidates search gathers, reused the same way: a later query in the same folder gathers again only when an input changed. A long-running caller that builds or searches repeatedly no longer reads every component, hook, doc, template and theme again for each query. Results are unchanged.

@vjeux
