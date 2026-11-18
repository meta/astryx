---
'@astryxdesign/core': patch
---

[fix] Icons, `useIcon`, and component icon slots use the nearest Theme's object, so registering or nesting another theme with the same name does not replace their artwork. Icons outside a provider keep the registered root-theme fallback.
@korkt-kim
