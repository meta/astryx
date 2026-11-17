---
'@astryxdesign/cli': patch
---

[fix] A theme module that throws from a microtask while it loads is refused with `ERR_THEME_LOAD` on older supported Node versions too. The error names the source and the exception, and no build outputs are written, including when the CLI supplies Core.
