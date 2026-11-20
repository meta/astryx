---
'@astryxdesign/cli': patch
---

[fix] `astryx build`: a page template named the way code writes it (`CheckoutWizard`, `kanbanBoard`) starts that template, as its plain words do, and so does a name with two neighbouring letters swapped in a word of six or more letters (`dashbaord`). Shorter words are read as written.

@josephfarina
