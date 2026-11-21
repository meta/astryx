---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade --apply` refreshes the Astryx skill in every place `astryx init --to` saved (astryx.config `skills.to`), under init's rules: the two copies of the project skills folders are written together or not at all, an edited file is kept, and nothing is written through a folder linked out of the project. The dry run names each file it would write. An Astryx block is still refreshed wherever it is, and a project that keeps its Astryx guidance only as a skill is no longer told to add it. `astryx doctor` adds a `skill-places` check: it passes when each saved skill file matches this release, and warns when one is missing or stale, when the two copies of a place differ, when the block and a project skill copy (in the project skills folders or a saved project folder) are both there without both being saved, or when a project skill is named `astryx`. Doctor's `computer-agent-text` check names the folders outside a project that `init --to` saved. Inside a project, `astryx init --to` naming only places outside it (`user`, or folders outside the project) with no feature beyond the agent docs is answered by the copy that started the run, as `--user` is.

@josephfarina
