---
'@astryxdesign/richtext': patch
---

[fix] RichTextExtensionNode is constructible with no arguments, as a registered node class must be. A Yjs collaboration binding builds one instance of every registered node class, with no arguments, to read its default properties, so creating a binding over an editor with this package's default nodes threw `TypeError: Cannot read properties of undefined (reading 'display')` before any document was loaded. Its `facts` now default to the same empty values the class already reads for damaged stored state, so a no-argument node reports an empty inline extension instead of throwing. A node built with facts is unchanged.

@potatowagon
