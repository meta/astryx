---
'@astryxdesign/core': patch
---

[fix] TextInput: the clear button now runs `changeAction` with the empty value and shows the optimistic empty value and busy state, as typing does. The clear goes through the input's own change handler, so `onChange` and `changeAction` receive a real change event (before, `onChange` received `null` as its event and `changeAction` did not run), `onChange` runs first, and its `preventDefault()` cancels the Action.

@ManoharPaturi @cixzhang
