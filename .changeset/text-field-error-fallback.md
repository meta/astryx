---
'@astryxdesign/core': patch
---

[fix] TextInput (outside an InputGroup) and TextArea: an error status without a message now gives screen readers text: the field is described by a hidden, translated "Invalid value", so assistive technology hears that the value has an error. In development the field also warns that the error has no message. Nothing changes on screen; give `status.message` to show the error in text.

@cixzhang
