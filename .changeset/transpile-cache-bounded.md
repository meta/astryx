---
'@astryxdesign/cli': patch
---

[fix] The per-user cache of transpiled TypeScript stays small and fast however many folders load the same files. Copies now live in `astryx/transpiled`, named for each file's text and settings, so the same file in many folders shares one copy, unless its text contains `meta`. Each new copy trims only its own subfolder, so no run reads the whole cache. Before, a machine that ran many projects or tests in fresh folders could fill the old single folder with hundreds of thousands of copies, and the next theme command spent minutes reading it. Project `doctor` now names that old folder and the command that removes it.

@josephfarina
