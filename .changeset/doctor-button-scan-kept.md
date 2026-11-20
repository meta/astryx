---
'@astryxdesign/cli': patch
---

[perf] Once the per-user catalogs folder exists, `astryx doctor` keeps what its `button-actions` check finds while every folder the check listed, every file it read and every package it looked up are unchanged. A warm `doctor` in a project that has not changed then skips that check's scan: it no longer parses the project's pages for buttons again. Every answer is unchanged.

@josephfarina
