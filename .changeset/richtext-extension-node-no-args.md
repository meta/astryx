---
'@astryxdesign/richtext': patch
---

[fix] RichTextExtensionNode is constructible with no arguments, as a registered node class must be. Lexical builds one instance of every registered class to read its properties, and a Yjs collaboration binding does the same when it starts, so creating a binding over an editor with this package's default nodes threw `TypeError: Cannot read properties of undefined (reading 'display')` before any document was loaded. Its `facts` now default to the same empty values the class already reads for damaged stored state, so a no-argument node reports an empty inline extension instead of throwing. A node built with facts is unchanged.

@potatowagon
