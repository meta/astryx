---
'@astryxdesign/cli': patch
---

[fix] On Node 22.13 and 22.14, a theme module that throws from a microtask while it loads is a refused theme load (`ERR_THEME_LOAD`, naming the error), as on later Node, instead of `ERR_UNKNOWN`. A theme that imports a stylesheet or an asset still needs Node 22.15 or later to load; on Node 22.13 and 22.14 its load is now refused with a message that names the file and the Node version it needs, and says that nothing was written, in place of Node's "Unknown file extension" error.

@cixzhang
