---
'@astryxdesign/cli': patch
---

[fix] In a Yarn Plug'n'Play project, the `astryx` command installed for the computer hands each run to the project's own CLI: it starts again with the project's runtime, as Yarn starts a command, instead of answering with its own release and telling you to install a CLI the project already has. Commands the CLI prints there start with `yarn astryx`, not with a `yarn dlx` download of the CLI.

@josephfarina
