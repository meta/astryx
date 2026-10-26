---
'@astryxdesign/core': patch
---

[fix] Tokenizer blocks token additions, creation, removal, and supplied removal callbacks while disabled, preserving enabled removal and focus behavior. Disabled form values are omitted instead of rendering native-disabled hidden inputs.
@korkt-kim
