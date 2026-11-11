---
'@astryxdesign/core': patch
---

[feat] On a touch screen, Tokenizer's Delete key takes two presses to remove a token, as iOS's search tokens do: the first Backspace on an empty input selects the last token (it takes the accent fill, and screen readers hear "{label} selected. Delete again to remove it.") and the second removes it. Typing anything else while a token is selected keeps it, and moving focus out of the field clears the selection. PowerSearch's value editors behave the same; its filter field draws its tokens with `renderToken`, so it keeps the one-press removal. With a mouse or a trackpad as the primary pointer, or with tokens drawn by `renderToken` (which shows no selected look), the first Backspace still removes the last token.

@vjeux
