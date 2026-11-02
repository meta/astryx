---
'@astryxdesign/core': patch
---

[fix] ChatComposerInput: a tap on a pasted-text token opens its preview without raising the keyboard. Before, the tap that opened the preview also focused the composer around the token and placed the caret in it, which on a phone raises the on-screen keyboard over the preview. Now a tap by finger or pen stops at the token, so touch reaches the preview and its Expand action without the keyboard covering them, the operable path `architecture:interaction-modality` INV4 asks of every modality; a mouse click on the token still places the caret in the composer, and hover still opens the preview.

@vjeux
