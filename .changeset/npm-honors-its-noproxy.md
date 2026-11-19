---
'@astryxdesign/cli': patch
---

[fix] The npm commands that the CLI runs for itself now use npm's own `noproxy` setting. These commands install a release into the CLI's per-user cache and ask the registry for versions. Before, when the shell's `NO_PROXY` named the npm registry but npm's own settings sent the registry through a proxy, npm went straight to the registry. Then the first command that needed the cache, such as `astryx component` outside a project, waited until npm's time limit and failed.

@josephfarina
