---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle` without Core says what to do. Outside a project, it says the folder is outside a project and that swizzle copies source into an app project that installs `@astryxdesign/core`; in a project that has not installed Core, it says to install it. It no longer tells you to work inside the design system's own repository. The error code stays `ERR_CORE_NOT_FOUND`.

@josephfarina
