---
'@astryxdesign/core': patch
---

[feat] TextArea `htmlMaxLength` sets the native `maxlength` attribute, so a form can cap typing in UTF-16 code units, including an SSR form before hydration. It is independent of `maxLength`, the soft counter, which still counts user-perceived characters and never blocks typing. TextArea adds no truncation or validation of its own, and renders no native `maxlength` when `htmlMaxLength` is unset.
@LekhNayak
