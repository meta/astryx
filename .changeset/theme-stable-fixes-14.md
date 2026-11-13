---
'@astryxdesign/cli': patch
---

[fix] The install example `theme build --detail full` (and `experimental theme compile --detail full`) prints says its paths are relative to a file in src/, and now they are: an output beside src/, such as `themes/ocean/ocean`, is imported as `../themes/ocean/ocean`, not `./themes/ocean/ocean`, which does not resolve from src/.

@josephfarina
