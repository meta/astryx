---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] ChatComposerInput restores a token when a whitespace-delimited word in a loaded or recalled draft deserializes to a token with the same value. Serialized token values containing whitespace remain plain text. Mention examples include deserializers.
@korkt-kim
