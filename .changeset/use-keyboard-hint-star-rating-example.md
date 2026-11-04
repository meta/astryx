---
'@astryxdesign/cli': patch
---

[docs] The `useKeyboardHint — Arrow-key Hint` example block now calls `useKeyboardHint` itself instead of relying on Toolbar, which calls the hook internally. It is a five-star rating with one Tab stop, where Left and Right change the rating: tabbing into it shows the "← → to navigate" hint, the first arrow press dismisses it, and tabbing back in does not show it again. Copy it with `astryx template useKeyboardHintHookUsage <path>`.

@kyu-rong
