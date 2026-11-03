---
'@astryxdesign/core': patch
---

[fix] Removing a Tokenizer token with a finger or a pen no longer raises the touch keyboard. A tap on a token's own remove button (Token's ×) used to move focus to the field's input inside the tap, which makes iOS and Android show their keyboard; when the input was not focused before the tap (the keyboard was down), focus now stays where it was. A tap made while typing, a mouse click, a key press on the remove button, and a remove control drawn by a custom `renderToken` still put focus in the input. PowerSearch's filter tokens, which render Token, get the same fix.

@vjeux
