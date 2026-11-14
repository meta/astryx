---
'@astryxdesign/core': patch
---

[fix] DateTimeInput opens its time options on the first pointer click when the component is mounted through a React root on `document`. The deferred show now belongs to the field and is cancelled when the field unmounts, so a click cannot be carried into the next interaction.

@josephfarina
