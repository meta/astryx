---
'@astryxdesign/core': patch
---

[feat] ChatComposerInput's Return key says Send on a touch keyboard. Enter already sends the message; the editor now sets `enterkeyhint="send"`, so iOS shows its Send key instead of a plain Return. A new `enterKeyHint` prop takes another label, such as `enter` for a composer whose `onKeyDown` makes Enter insert a line break on touch keyboards.

@vjeux
