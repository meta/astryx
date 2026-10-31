---
'@astryxdesign/core': patch
---

[fix] Inside `<FormLayout defaultOptionality="required">`, FileInput and Slider now tell screen readers they are required even without their own `isRequired`, like the other fields. `isOptional` still opts a field out.

@cixzhang
