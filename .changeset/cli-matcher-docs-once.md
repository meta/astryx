---
'@astryxdesign/cli': patch
---

[perf] Within one operation, component discovery reads each component doc once, and the component matcher looks for each component's doc once, not once for each name they resolve. Resolving 30 names that only the matcher finds, such as names in another case, makes 14,794 file-system calls instead of 305,108. Results are unchanged.

@vjeux
