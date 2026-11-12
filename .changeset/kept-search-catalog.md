---
'@astryxdesign/cli': patch
---

[perf] `search` and `build` keep the catalog they gather in a private folder in the user's cache folder (`catalogs`, beside the release cache), and a later run uses it only while every file and folder it read, every module it loaded, and every environment variable it read (kept as a digest, never its value) are unchanged. Otherwise the run gathers fresh, exactly as before. A run with unchanged inputs answers in about a third of the time, with the same output. Only a published CLI keeps catalogs, and not where folder ownership cannot be checked (Windows) or under Yarn Plug'n'Play; `doctor` lists the folder and its size, and deleting the folder clears it.

@josephfarina
