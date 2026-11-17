---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a clause that only states a bound on a part, such as "never make buttons rounder than 12px", as a limit on the asks said with it, before or after them. The bound never becomes an ask of its own, and it never gives its part to those asks. Each answer that would build the part past the bound holds it there: it sets the part's own token after the answer's steps and says so. An answer that already keeps the part within the bound says that too.

@josephfarina
