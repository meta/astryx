---
'@astryxdesign/cli': patch
---

[perf] `upgrade` skips a codemod for a file that holds a backslash when the file's escapes spell none of the codemod's words, as it already did for files with no backslash. Before, any backslash anywhere in a file (a `\n` in a string, a `\d` in a regular expression) sent the file through every codemod's parse, so a scan of a typical app parsed about a quarter of its files several more times than needed. An upgrade from 0.6.8 answered 24% to 55% sooner across the apps measured; ranges that run mostly older codemods gain less, because those codemods still run on every file. Output and written files are unchanged.

@josephfarina
