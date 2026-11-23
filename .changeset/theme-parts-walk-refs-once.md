---
'@astryxdesign/cli': patch
---

[perf] The theme editor reads the parts a census page draws faster: each CSS value's variables are read once for one walk of the page, and an element that sets no variable shares its parent's. What each part reads is unchanged.

@josephfarina
