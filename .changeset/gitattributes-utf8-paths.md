---
'@astryxdesign/cli': patch
---

[fix] File protection now decodes consecutive octal escapes in quoted `.gitattributes` paths as UTF-8 bytes. Before, a rule such as `"caf\303\251.js" linguist-generated` was treated as separate code points and failed to protect the matching `café.js` file; quoted and literal UTF-8 spellings now classify consistently.

@bezabyte
