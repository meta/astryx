---
'@astryxdesign/core': patch
---

[fix] parseColor answers null for a colour name that the prototype chain supplies (constructor, **proto**), instead of a truthy empty RGBA that crashed the composed parseColor-then-formatColor callers on undefined channels (#10468)
@aashish254
