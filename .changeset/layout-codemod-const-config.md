---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` no longer reports an error on an `astryx.config` written as `const config = {...}; export default config;`, the shape generated configs use. The `migrate-layout-components-to-experimental` codemod now follows a default-exported identifier to its top-level `const` binding when the binding is not exported any other way and nothing else references it, so a config without `layout` is left unchanged and one with `layout.components` is migrated.

@ejhammond
