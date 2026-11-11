---
'@astryxdesign/cli': patch
---

[perf] `search` and `build` keep the catalog they gather in the user's own folder under the system temp folder, and a later run uses it only while every file and folder it read, every module it loaded, and every environment variable it read are unchanged. Otherwise the run gathers fresh, exactly as before. A run with unchanged inputs answers in about a third of the time, with the same output. Only a published CLI keeps catalogs; `doctor` lists the folder and its size, and deleting the folder clears it.

@josephfarina
