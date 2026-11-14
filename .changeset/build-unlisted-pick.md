---
'@astryxdesign/cli': patch
---

[fix] When `astryx build`'s ranker picks a template the word tables don't list, it now weighs that template against the pick model's best listed page, the same model that chooses the page everywhere else, instead of against the call model's.

@josephfarina
