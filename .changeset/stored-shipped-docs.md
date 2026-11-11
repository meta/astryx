---
'@astryxdesign/cli': patch
---

[perf] Commands that read the docs Astryx ships (`search`, `build`, `docs`, `template`) read each shipped doc that holds only plain data from a copy of its exports stored in the package when it is published, instead of importing the file. The copy is keyed by the file's text, so an edited doc, a doc that imports or calls anything as it loads, and every integration's docs are imported as before. Every command prints the same output.

@josephfarina
