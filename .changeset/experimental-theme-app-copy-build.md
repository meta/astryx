---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the app copy in `src/themes/<theme>/` is written exactly as `theme build` of its source writes it (the build header names that source), so `theme build --check` and `astryx doctor` read it as current, and a stable rebuild of it leaves it the editor's (the next change writes it again). A change that fails after its build no longer leaves the refused build in the app copy: the copy is written only once the change is saved.

@josephfarina
