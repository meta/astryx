---
'@astryxdesign/cli': patch
---

[fix] When page templates of one family tie exactly and the ranker's pick is one the word tables do not list (such as the collapsible and comparison tables, or an integration's template), `astryx build` starts from the tied template whose own description, keywords and page components best match the idea, then the one most typical of its family, instead of the alphabetically first.

@josephfarina
