---
'@astryxdesign/core': minor
---

[breaking] On a touch screen, Tokenizer's inline field (a tablet's default, or `presentation="popover"`) takes two Delete presses to remove a token, as iOS's search tokens do: the first Backspace on an empty input selects the last token (it takes the accent fill, or the system highlight in forced colors, and screen readers hear "{label} selected. Delete again to remove it.") and the second removes it. Typing anything else while a token is selected keeps it, and moving focus out of the field clears the selection. PowerSearch's popover value editors and Table's list filter behave the same; PowerSearch's filter field draws its tokens with `renderToken`, so it keeps the one-press removal. A phone's default field is the bottom sheet, which has no input, so nothing changes there. With a mouse or a trackpad as the primary pointer, or with tokens drawn by `renderToken` (which shows no selected look), the first Backspace still removes the last token. No option keeps one press on touch.

@vjeux
