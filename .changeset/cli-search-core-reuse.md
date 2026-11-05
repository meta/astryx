---
'@astryxdesign/cli': patch
---

[fix] The lexical ranker behind `astryx build`'s search ranks the candidates search gathers, reused the same way. A later query in the same folder, for the same `type`, gathers again only when an input changed. In a long-running caller, a build that follows a build or a search no longer reads every component, hook, doc, template and theme again. A search that follows a build no longer reads them again either. Results are unchanged.

@vjeux
