---
'@astryxdesign/cli': patch
---

[fix] In a folder inside an Astryx project whose own `package.json` declares no Astryx package, such as a tool folder that installs its own `@astryxdesign/core`, the setup reminder's `init` command now names the project's release, as run from the project's folder: the project's own CLI when it installs one, otherwise the package runner pinned to the project's Core, such as `npx @astryxdesign/cli@0.7.3 init`. It used to pin the release of the CLI that answered the run, whatever the project records. No JSON shape or exit code changes.

@josephfarina
