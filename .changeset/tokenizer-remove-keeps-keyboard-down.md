---
'@astryxdesign/core': patch
---

[fix] In Tokenizer's inline field on a touch screen (a tablet, or `presentation="popover"` on a phone), removing a token with a finger no longer raises the touch keyboard. A tap on a token's own remove button (Token's ×) used to move focus to the field's input inside the tap, which makes iOS and Android show their keyboard; when the input was not focused before the tap (the keyboard was down), focus now stays where it was, unless the tapped × or another control in its token held focus, when focus moves to the input as before. A tap made while typing, a pen's tap, a mouse click, a key press on the remove button, and a remove control drawn by a custom `renderToken` still put focus in the input. PowerSearch's filter tokens, which render Token, get the same fix.

@vjeux
