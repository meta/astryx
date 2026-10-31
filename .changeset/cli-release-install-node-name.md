---
'@astryxdesign/cli': patch
---

[fix] A run that takes over a crashed run's release-cache lock now also recognizes the npm install that run left behind by its original command line, as npm shows it before renaming its process, when Node's own file is not named `node`, such as `nodejs` or `node-linux-x64`.

@vjeux
