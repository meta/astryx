---
'@astryxdesign/core': patch
---

[fix] Core's install note no longer tells a project that keeps its Astryx guidance as a project skill (`astryx init --to skills`, or a folder in the project) to run `init`: the setup check also counts the Astryx project skill in `.agents/skills`, `.claude/skills`, or a project folder astryx.config saves (`astryx init --to ./<folder>`), read from the config's text without running it.

@josephfarina
