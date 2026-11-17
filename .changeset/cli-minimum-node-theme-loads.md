---
'@astryxdesign/cli': patch
---

[fix] A theme module that throws from a microtask while it loads is a refused theme load (`ERR_THEME_LOAD`, naming the error) on every supported Node. Before, Node before 24 answered `ERR_UNKNOWN`, and a theme loaded through the CLI's own Core (no Core in its folder, and each member of a `--family` build) could build with the exception dropped. `astryx theme build` and the theme editor still need Node 22.15 or later, or 23.5 or later, to load a theme that imports a stylesheet or an asset, and so does a recorded theme that imports an asset, or a stylesheet that a module in another folder imports by a relative path. On an older Node those loads are now refused with a message that names the file and the Node versions that load it, and says that nothing was written, in place of Node's "Unknown file extension" or "Unexpected token" error. A recorded theme's other stylesheets still load there.

@cixzhang
