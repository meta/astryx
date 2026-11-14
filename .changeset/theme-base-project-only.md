---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` counts a base theme as installed only when the project installs it, in its `node_modules` folders or through Yarn Plug'n'Play, as the app's bundler sees it. A theme found only through `NODE_PATH` or Node's global folders is no longer taken as installed: `new` and `set base` offer to install it instead of writing a theme the app could not build.

@cixzhang
