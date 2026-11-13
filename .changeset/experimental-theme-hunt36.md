---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` finds the app by one rule: the nearest folder at or above the working folder whose package.json lists `@astryxdesign/core` (in dependencies, devDependencies or peerDependencies). A workspace member that does not use Core, a subfolder of an app that does not list it, a workspace root with deep globs or any pnpm-workspace.yaml form are refused with where Core resolves from and the workspace's apps that list it, each with the `cd` to run from; nothing is written into the wrong folder. A nested repository inside an app no longer hides the app above it.

@josephfarina
