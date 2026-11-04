---
'@astryxdesign/cli': patch
---

[perf] `astryx --version` no longer loads the doc schemas, discovery, the project loader or jiti, unless the project's astryx.config names `debug` or `integrations`. The release choice, the debug preload and the setup nudge read small helper modules instead.

@vjeux
